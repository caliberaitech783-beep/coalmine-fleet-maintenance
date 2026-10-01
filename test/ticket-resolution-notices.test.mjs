import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {transformWithOxc} from 'vite';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const routes=server.slice(server.indexOf("app.get('/api/tickets/resolution-notices'"),server.indexOf("app.patch('/api/tickets/resolve'"));
test('resolution notices and acknowledgement are restricted to the creator and closing preserves ticket status',async()=>{
  const handlers={},queries=[];
  const pool={query:async(sql,values)=>{queries.push({sql,values});assert.match(sql,/lower\(trim\(creator_login\)\)=\$[12]/);assert.match(sql,/status='Resolved'/);return {rows:values.includes('owner')?[{reference:'TIC/SITE/1'}]:[]};}};
  new Function('app','requireSession','pool','ticketProjection',routes)({get:(path,...args)=>handlers[path]=args.at(-1),patch:(path,...args)=>handlers[path]=args.at(-1)},()=>{},pool,()=>'*');
  const call=async(path,login,body={})=>{
    let code=200,result,cache;
    const req={session:{login},body};
    const res={status(value){code=value;return this},json(value){result=value},set(key,value){cache=value}};
    await handlers[path](req,res,error=>{throw error});
    return {code,result,cache,req};
  };
  assert.match(routes,/resolution-notices',requireSession/);
  assert.match(routes,/acknowledge-resolution',requireSession/);
  assert.equal((await call('/api/tickets/resolution-notices',' OWNER ')).cache,'private, no-store');
  assert.match(queries[0].sql,/resolution_acknowledged_at IS NULL/);
  assert.equal((await call('/api/tickets/acknowledge-resolution','another',{reference:'TIC/SITE/1'})).code,404);
  const own=await call('/api/tickets/acknowledge-resolution','owner',{reference:'TIC/SITE/1'});
  assert.equal(own.result.acknowledged,true);
  assert.equal(own.req.audit.targetReference,'TIC/SITE/1');
  assert.match(queries.at(-1).sql,/COALESCE\(resolution_acknowledged_at,NOW\(\)\)/);
  assert.doesNotMatch(queries.at(-1).sql,/SET status/);
  assert.equal((await call('/api/tickets/acknowledge-resolution','owner')).code,400);
});

const source=readFileSync(new URL('../src/ticket-resolution-notices.jsx',import.meta.url),'utf8');
const {code}=await transformWithOxc(source.replace(/^import .*;\r?\n/gm,'').replace('export default function','function'),'notices.jsx',{jsx:{runtime:'classic'}});
test('notice persists until successful manual close and late polling cannot restore a dismissed notice',async()=>{
  let cursor=0,poll,failClose=true;
  const slots=[],effects=[];
  const useState=initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];};
  const ticket={reference:'TIC/SITE/1',resolutionMessage:'Fixed',resolvedBy:'Admin'};
  const scope={React,useState,useRef:value=>{const [ref]=useState({current:value});return ref},useEffect:fn=>{effects.push(fn)},startVisiblePoll:fn=>{poll=fn;return()=>{}},ProtectedAudio:()=>null,ProtectedAttachment:()=>null,
    fetch:async(url)=>({ok:url.endsWith('resolution-notices')||!failClose,json:async()=>url.endsWith('resolution-notices')?[ticket]:failClose?{error:'Network failure'}:{acknowledged:true}})};
  const Component=new Function(...Object.keys(scope),code+';return TicketResolutionNotices;')(...Object.values(scope));
  const render=()=>{cursor=0;return Component({token:'fixture'});};
  const buttons=tree=>{const result=[];const visit=node=>{if(Array.isArray(node))node.forEach(visit);else if(React.isValidElement(node)){if(node.type==='button')result.push(node);visit(node.props.children);}};visit(tree);return result;};
  assert.equal(render(),null);effects[0]();await poll();
  let tree=render();assert.equal(tree.type,'aside');
  await buttons(tree)[0].props.onClick();assert.ok(render(),'failed acknowledgement must keep notice visible');
  failClose=false;await buttons(render())[0].props.onClick();assert.equal(render(),null);
  await poll();assert.equal(render(),null,'stale polling cannot resurrect a successfully closed notice');
  assert.doesNotMatch(source,/setTimeout|onMouseLeave|onKeyDown/);
  const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.match(main,/<TicketResolutionNotices key=\{token\} token=\{token\} \/>/);
  assert.equal((main.match(/<AppBackgroundServices session=\{session\} logout=\{logout\} \/>/g)||[]).length,2);
});
