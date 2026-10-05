import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const helper=server.slice(server.indexOf('async function withLinkedMaintenanceSelection('),server.indexOf("app.post('/api/requests/:reference/daily-remarks'"));
const linkSql=server.match(/`(UPDATE maintenance_requests SET linked_request_references=[^`]+)`/)[1];
test('separate visits are linked without changing the older ticket and selected updates are atomic',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE maintenance_requests(reference text PRIMARY KEY,status text,complaint text,linked_request_references jsonb DEFAULT '[]'); INSERT INTO maintenance_requests VALUES ('FIRST','Running BD','Parts unavailable','[]'),('SECOND','Open','Hydraulic leak','[]'),('OTHER','Open','Other vehicle','[]');`);
  await db.query(linkSql,[JSON.stringify(['FIRST','SECOND']),['FIRST','SECOND']]);
  let rows=(await db.query('SELECT * FROM maintenance_requests ORDER BY reference')).rows;
  assert.equal(rows[0].status,'Running BD');assert.equal(rows[0].complaint,'Parts unavailable');assert.deepEqual(rows[0].linked_request_references,['SECOND']);
  const client={query:(...args)=>db.query(...args),release(){}};
  const scope={pool:{connect:async()=>client},withMaintenanceArrivalGuard:async(req,reference,write,shared)=>{
    assert.equal(shared,client);
    const before=(await client.query('SELECT * FROM maintenance_requests WHERE reference=$1 FOR UPDATE',[reference])).rows[0];
    if(req.body.fail===reference)throw Error('Invalid evidence');
    return write(client,before,reference);
  }};
  runInNewContext(helper+';globalThis.select=withLinkedMaintenanceSelection;',scope);
  const write=async(client,before,reference)=>({rows:(await client.query("UPDATE maintenance_requests SET status='Closed' WHERE reference=$1 RETURNING *",[reference])).rows});
  await scope.select({body:{targetReferences:['SECOND']}},'FIRST',write);
  rows=(await db.query('SELECT * FROM maintenance_requests ORDER BY reference')).rows;
  assert.equal(rows[0].status,'Running BD');assert.equal(rows[2].status,'Closed');
  await assert.rejects(()=>scope.select({body:{targetReferences:['OTHER']}},'FIRST',write),/only tickets linked/);
  await db.exec("UPDATE maintenance_requests SET status='Running BD' WHERE reference IN ('FIRST','SECOND')");
  await assert.rejects(()=>scope.select({body:{targetReferences:['FIRST','SECOND'],fail:'SECOND'}},'FIRST',write),/Invalid evidence/);
  assert.ok((await db.query("SELECT status FROM maintenance_requests WHERE reference IN ('FIRST','SECOND')")).rows.every(row=>row.status==='Running BD'));
  const result=await scope.select({body:{targetReferences:['FIRST','SECOND']}},'FIRST',write);
  assert.equal(result.rows.length,2);assert.ok(result.rows.every(row=>row.status==='Closed'));
  assert.equal((await db.query("SELECT status FROM maintenance_requests WHERE reference='OTHER'")).rows[0].status,'Open');
 }finally{await db.close();}
});
test('repeat creation inserts a new ticket and does not resume the previous one',()=>{
 const route=server.slice(server.indexOf("app.post('/api/requests',"),server.indexOf("app.patch('/api/requests/:reference',"));
 assert.ok(route.includes('INSERT INTO maintenance_requests'));assert.ok(route.includes('linked_request_references'));
 assert.ok(!route.includes("status='In progress',running_bd_at=NULL"));
});
