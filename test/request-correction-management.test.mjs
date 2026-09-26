import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {canManagePendingCorrection,REQUEST_CORRECTION_STATUS as STATUS} from '../request-correction-policy.mjs';

const record={status:STATUS.PENDING,requestedByLogin:' Manager ',correctionType:'onRoad'};
const owner={requester:true,login:'manager',allowedTypes:['onRoad'],inScope:true};
test('pending corrections can be managed by their department manager or an administrator',()=>{
  assert.equal(canManagePendingCorrection(record,owner),true);
  assert.equal(canManagePendingCorrection(record,{administrator:true}),true);
  for(const context of [{},{pm:true},{...owner,login:'another'},{...owner,inScope:false},{...owner,allowedTypes:['offRoad']},{...owner,requester:false}])assert.equal(!!canManagePendingCorrection(record,context),false);
});
test('reviewed and deleted corrections stay immutable for all roles',()=>{
  for(const status of [STATUS.APPROVED,STATUS.REJECTED,STATUS.APPLIED,STATUS.DELETED]){
    for(const context of [owner,{administrator:true}])assert.equal(canManagePendingCorrection({...record,status},context),false);
  }
});
test('pending correction endpoints lock the row, validate edits and retain deletion history',async()=>{
  const server=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
  const view=await readFile(new URL('../src/request-corrections.jsx',import.meta.url),'utf8');
  assert.match(server,/app\.patch\('\/api\/request-corrections\/:id',requireSession,managePendingCorrection\)/);
  assert.match(server,/app\.delete\('\/api\/request-corrections\/:id',requireSession,managePendingCorrection\)/);
  const handler=server.slice(server.indexOf('async function managePendingCorrection'),server.indexOf("app.patch('/api/request-corrections/:id/review'"));
  assert.match(handler,/FOR UPDATE/);
  assert.match(handler,/canManagePendingCorrection\(before/);
  assert.match(handler,/normalizeRequestCorrectionChanges/);
  assert.match(handler,/REQUEST_CORRECTION_STATUS.DELETED/);
  assert.doesNotMatch(handler,/DELETE FROM|UPDATE maintenance_requests/);
  assert.match(handler,/req.audit=/);
  assert.match(view,/record.canManage/);
  assert.match(view,/Confirm delete/);
  assert.match(view,/Save changes/);
  assert.match(view,/REQUEST_CORRECTION_STATUS.DELETED,'All'/);
});

test('management handler commits valid changes and rolls back denied or invalid operations',async()=>{
  const server=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
  const source=server.slice(server.indexOf('async function managePendingCorrection'),server.indexOf("  app.patch('/api/request-corrections/:id',"));
  const {normalizeRequestCorrectionChanges,requestCorrectionChangedFields}=await import('../request-correction-policy.mjs');
  async function run({method='PATCH',context=owner,status=STATUS.PENDING,body={reason:'Correcting an entry mistake',proposedChanges:{closedBy:'Correct name'}}}={}){
    const before={...record,id:1,status,site:'Site A',requestReference:'REQ-1',originalValues:{closedBy:'Original name'},proposedChanges:{closedBy:'Wrong name'},reason:'Original correction reason'};
    const queries=[];let saved,released=false,error;
    const client={async query(sql,args){queries.push({sql,args});if(sql.startsWith('SELECT'))return {rows:[before]};if(sql.startsWith('UPDATE')){saved={...before,...(method==='DELETE'?{status:args[0]}:{proposedChanges:JSON.parse(args[0]),reason:args[1]})};return {rows:[saved]}}return {rows:[]}},release(){released=true}};
    const handler=new Function('pool','requestCorrectionAccessContext','requestCorrectionProjection','canManagePendingCorrection','reportScopeIncludesSite','REQUEST_CORRECTION_STATUS','normalizeRequestCorrectionChanges','correctionBreakdownTypes','requestCorrectionChangedFields',`${source}; return managePendingCorrection;`)(
      {connect:async()=>client},async()=>context,'fixture',canManagePendingCorrection,()=>context.inScope,STATUS,normalizeRequestCorrectionChanges,async()=>[],requestCorrectionChangedFields);
    const req={params:{id:'1'},method,body,session:{}};let result;
    await handler(req,{json(value){result=value}},problem=>{error=problem});
    assert.equal(released,true);
    return {queries,req,result,error};
  }
  const edit=await run();assert.equal(edit.error,undefined);assert.equal(edit.result.proposedChanges.closedBy,'Correct name');assert.equal(edit.result.status,STATUS.PENDING);assert.equal(edit.req.audit.action,'Edit pending correction');assert.equal(edit.queries.at(-1).sql,'COMMIT');
  const deletion=await run({method:'DELETE',context:{administrator:true}});assert.equal(deletion.result.status,STATUS.DELETED);assert.equal(deletion.req.audit.action,'Delete pending correction');
  for(const options of [{context:{...owner,login:'someone-else'}},{context:{...owner,inScope:false}},{status:STATUS.APPROVED},{method:'DELETE',status:STATUS.APPLIED},{body:{reason:'short',proposedChanges:{closedBy:'Changed'}}},{body:{reason:'Valid correction reason',proposedChanges:{closedBy:'Original name'}}}]){
    const denied=await run(options);assert.ok(denied.error);assert.equal(denied.result,undefined);assert.equal(denied.queries.at(-1).sql,'ROLLBACK');assert.equal(denied.queries.some(({sql})=>sql.startsWith('UPDATE')),false);
  }
});
