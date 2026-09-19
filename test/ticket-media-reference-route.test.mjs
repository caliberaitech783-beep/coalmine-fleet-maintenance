import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import express from 'express';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const between=(start,end,from=0)=>{const i=server.indexOf(start,from);assert.ok(i>=0,start);const j=server.indexOf(end,i+start.length);assert.ok(j>i,end);return server.slice(i,j);};
const evaluate=(source,deps)=>new Function(...Object.keys(deps),source)(...Object.values(deps));
const sendDataUrlMedia=evaluate(`${between('function sendDataUrlMedia(','const connectionString=')};return sendDataUrlMedia;`,{});
const routeStart=server.indexOf('const ticketMediaFields=');
const mediaRoute=server.slice(routeStart,server.indexOf('\napp.',server.indexOf("app.get('/api/tickets/",routeStart)+1));

const attachment=Buffer.from('ticket attachment bytes');
const ticket={creatorLogin:'suraj',creatorRole:'Maintenance User',site:'Not assigned',data:`data:image/png;base64,${attachment.toString('base64')}`,name:'request-correction.png'};

async function withMediaServer(run){
  const queries=[];
  const app=express();
  evaluate(mediaRoute,{app,requireSession:(req,_res,next)=>{req.session={role:'super',login:'admin',permissions:{adminLevel:'Admin'}};next();},
    ticketVisibleToSession:async()=>true,sendDataUrlMedia,
    pool:{query:async(sql,values)=>{queries.push(values[0]);return {rows:values[0]==='TIC/NOT-ASSIGNED/190926/000099'?[ticket]:[]};}}});
  app.use((req,res)=>res.status(404).type('text/plain').send(`Cannot GET ${req.url}`));
  const listener=await new Promise((resolve)=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{return await run(`http://127.0.0.1:${listener.address().port}`,queries);}finally{listener.close();}
}

test('ticket attachments open whether or not the slashes in the ticket reference arrive encoded',async()=>{
  await withMediaServer(async(base,queries)=>{
    // The browser sends %2F; Azure's front end forwards the reference with plain slashes.
    for(const path of ['/api/tickets/TIC%2FNOT-ASSIGNED%2F190926%2F000099/media/attachment','/api/tickets/TIC/NOT-ASSIGNED/190926/000099/media/attachment']){
      const response=await fetch(`${base}${path}`);
      assert.equal(response.status,200,path);
      assert.equal(response.headers.get('content-type'),'image/png');
      assert.match(response.headers.get('content-disposition'),/inline; filename="request-correction\.png"/);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),attachment,path);
    }
    assert.deepEqual(queries,['TIC/NOT-ASSIGNED/190926/000099','TIC/NOT-ASSIGNED/190926/000099']);
  });
});

test('ticket media keeps rejecting unknown media kinds, missing tickets and paths without a reference',async()=>{
  await withMediaServer(async(base)=>{
    const unknownKind=await fetch(`${base}/api/tickets/TIC/NOT-ASSIGNED/190926/000099/media/other`);
    assert.equal(unknownKind.status,404);
    assert.deepEqual(await unknownKind.json(),{error:'Ticket media is not available.'});
    const missing=await fetch(`${base}/api/tickets/TIC/MAJRI-OB/190926/000404/media/attachment`);
    assert.equal(missing.status,404);
    assert.deepEqual(await missing.json(),{error:'Ticket media is not available.'});
    assert.equal((await fetch(`${base}/api/tickets/media/attachment`)).status,404);
  });
  assert.match(server,/app\.get\('\/api\/tickets\/\*reference\/media\/:kind',requireSession,/);
  assert.doesNotMatch(server,/app\.get\('\/api\/tickets\/:reference\/media\/:kind'/);
});
