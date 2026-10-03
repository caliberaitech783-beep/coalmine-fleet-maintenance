import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canEditBreakdownResponsibility} from '../breakdown-responsibility.mjs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const manager=role=>({role:'super',login:'manager',name:'Manager',permissions:{adminLevel:'Manager',managerRoles:[role]}});
test('only the two specified manager roles qualify, including multi-role profiles',()=>{
  for(const role of ['Maintenance Manager','Project Manager'])assert.equal(canEditBreakdownResponsibility(manager(role)),true);
  for(const role of ['Production Manager','MIS Manager'])assert.equal(canEditBreakdownResponsibility(manager(role)),false);
  for(const session of [null,{}, {role:'normal',assignedRole:'Maintenance User'}, {role:'super',permissions:{adminLevel:'Admin'}}, {role:'super',permissions:{adminLevel:'Super Admin'}}])assert.equal(canEditBreakdownResponsibility(session),false);
  assert.equal(canEditBreakdownResponsibility({role:'super',permissions:{adminLevel:'Manager',managerRole:'MIS Manager | Project Manager'}}),true);
});

function fixture({scope=true,accepted=true,active=true,arrival=true,failAudit=false}={}){
  let responsibility='NON OEM', history=[], snapshot;
  const queries=[];
  const client={release(){},async query(sql,args=[]){
    queries.push(sql);
    if(sql==='BEGIN'){snapshot={responsibility,history:[...history]};return {};}
    if(sql==='ROLLBACK'){responsibility=snapshot.responsibility;history=snapshot.history;return {};}
    if(sql==='COMMIT')return {};
    if(sql.includes('FOR UPDATE'))return {rows:active?[{site:'Jayant OC',oemResponsibility:responsibility,acceptedAt:accepted?'2026-10-03 10:00:00':null,arrival_flag_ready:arrival}]:[]};
    if(sql.startsWith('SELECT oem_responsibility FROM'))return {rows:[{oem_responsibility:responsibility}]};
    if(sql.startsWith('UPDATE maintenance_requests SET oem_responsibility_history')){
      if(failAudit)throw new Error('audit unavailable');
      history.push({from:args[0],to:args[1],changedBy:args[2],login:args[3]});return {};
    }
    if(sql.startsWith('UPDATE maintenance_requests SET oem_responsibility=$1'))responsibility=args[0];
    return {rows:[{ref:'REQ-1',oemResponsibility:responsibility,oemResponsibilityHistory:[...history]}]};
  }};
  const guardSource=server.slice(server.indexOf('async function withMaintenanceArrivalGuard('),server.indexOf("app.post('/api/requests/:reference/daily-remarks'"));
  const guard=new Function('pool','arrivalFlagReadySql','requestTimelineProjection','requestProjection','currentUserRecord','userSiteScope','reportScopeIncludesSite','maintenanceManagerSession','userManagesSite','arrivalRedFlagError','recordRequestTimeline',`${guardSource}; return withMaintenanceArrivalGuard;`)(
    {connect:async()=>client},'ready','timeline','projection',async()=>({}),()=>[],()=>scope,s=>s.permissions?.managerRoles?.includes('Maintenance Manager'),()=>scope,()=>Object.assign(new Error('Arrival flag required'),{status:409}),async()=>{});
  let handler;
  const routeSource=server.slice(server.indexOf('function registerBreakdownResponsibilityRoute(){'),server.indexOf("app.patch('/api/requests/:reference',"))+'\nregisterBreakdownResponsibilityRoute();';
  new Function('app','requireSession','canEditBreakdownResponsibility','withMaintenanceArrivalGuard','userManagesSite','currentUserRecord','requestProjection','maintenanceWriteFailure',routeSource)(
    {patch(path,middleware,fn){handler=fn;}},()=>{},canEditBreakdownResponsibility,guard,()=>scope,async()=>({}),'projection',(error,res)=>res.status(error.status||500).json({error:error.message}));
  return {queries,get responsibility(){return responsibility;},get history(){return history;},async run(session=manager('Project Manager'),body={oemResponsibility:'OEM',previousResponsibility:'NON OEM'}){
    let status=200,data;
    const res={status(code){status=code;return this;},json(value){data=value;return this;}};
    await handler({session,params:{reference:'REQ-1'},body},res,()=>{});
    return {status,data};
  }};
}
test('manager save is site scoped and atomically records real old/new values',async()=>{
  for(const role of ['Maintenance Manager','Project Manager']){
    const f=fixture();const result=await f.run(manager(role));
    assert.equal(result.status,200);assert.equal(f.responsibility,'OEM');
    assert.deepEqual(f.history,[{from:'NON OEM',to:'OEM',changedBy:'Manager',login:'manager'}]);
    assert.equal(result.data.oemResponsibilityHistory.length,1);
    assert.ok(f.queries.indexOf('COMMIT')>f.queries.findIndex(q=>q.includes('SET oem_responsibility_history')));
  }
});
test('other roles, unassigned sites, inactive requests, missing acceptance and flags cannot change responsibility',async()=>{
  for(const role of ['Production Manager','MIS Manager'])assert.equal((await fixture().run(manager(role))).status,403);
  for(const role of ['Maintenance Manager','Project Manager'])assert.equal((await fixture({scope:false}).run(manager(role))).status,403);
  assert.equal((await fixture({active:false}).run()).status,409);
  assert.equal((await fixture({accepted:false}).run()).status,400);
  assert.equal((await fixture({arrival:false}).run()).status,409);
  assert.match(server,/status NOT IN \('Closed','Idle','Ideal'\) AND verified_at IS NULL FOR UPDATE/);
});
test('stale/invalid saves reject; unchanged saves do not create history',async()=>{
  const f=fixture();
  assert.equal((await f.run(undefined,{oemResponsibility:'OEM',previousResponsibility:'OEM'})).status,409);
  assert.equal((await f.run(undefined,{oemResponsibility:'other',previousResponsibility:'NON OEM'})).status,400);
  assert.equal((await f.run(undefined,{oemResponsibility:'NON OEM',previousResponsibility:'NON OEM'})).status,200);
  assert.equal(f.history.length,0);
});
test('audit failure rolls back the responsibility change',async()=>{
  const f=fixture({failAudit:true});assert.equal((await f.run()).status,500);
  assert.equal(f.responsibility,'NON OEM');assert.deepEqual(f.history,[]);assert.ok(f.queries.includes('ROLLBACK'));
});

test('general edit keeps saved responsibility locked except authorized managers and rejects stale changes',()=>{
  const start=server.indexOf('    if(oemResponsibility!==undefined&&before.oemResponsibility&&');
  const checks=server.slice(start).split('\n').slice(0,2).join('\n');
  const validate=new Function('req','before','oemResponsibility','canEditBreakdownResponsibility',checks);
  const before={oemResponsibility:'NON OEM'};
  assert.doesNotThrow(()=>validate({session:manager('Maintenance Manager'),body:{previousResponsibility:'NON OEM'}},before,'OEM',canEditBreakdownResponsibility));
  for(const session of [manager('MIS Manager'),manager('Production Manager'),{role:'normal'},{role:'super',permissions:{adminLevel:'Admin'}}]){
    assert.throws(()=>validate({session,body:{previousResponsibility:'NON OEM'}},before,'OEM',canEditBreakdownResponsibility),/locked/);
  }
  for(const previousResponsibility of ['OEM',undefined]){
    assert.throws(()=>validate({session:manager('Maintenance Manager'),body:{previousResponsibility}},before,'OEM',canEditBreakdownResponsibility),/Refresh and review/);
  }
});
test('history column is present in both shared tables and UI writes only on submit',()=>{
  const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../src/breakdown-responsibility-history.jsx',import.meta.url),'utf8');
  assert.ok(main.includes('<ResponsibilityHistoryCell request={r} />'));
  assert.ok(main.includes('<ResponsibilityHistoryCell request={row} />'));
  assert.doesNotMatch(ui, /fetch\(|onSubmit|<select|<button/);
  assert.match(ui, /responsibilityHistoryText\(request, formatDate\)/);
  assert.match(main, /<RequestEditForm canEditResponsibility/);
  assert.match(main, /canEdit=\{canEditResponsibility\}/);
});
