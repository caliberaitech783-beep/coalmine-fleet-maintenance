import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildBdAgeingReport,canViewBdAgeingReport,bdAgeingReportHandler} from '../bd-ageing-report.mjs';

const now = Date.parse('2026-10-06T06:30:00Z');
const day = 86400000;
const row = (age,extra={}) => ({ref:`REQ-${age}`,start:new Date(now-age).toISOString(),status:'Accepted',site:'Majri OC',...extra});
test('only the four exact authenticated usernames are allowed, never names or admin roles',()=>{
  for (const login of ['MOHITCHADDA','MANISHCHADDA','RAHULCHADDA','THAKUR@1990',' mohitCHADDA ']) assert.equal(canViewBdAgeingReport({login}),true);
  for (const session of [null,{}, {login:'MOHITCHADDA2'}, {login:'THAKUR'}, {name:'MOHITCHADDA'}, {login:'admin',role:'super',permissions:{adminLevel:'Super Admin'}}, {login:'x',permissions:{reportAccess:{'BD Ageing Report':true}}}]) assert.equal(canViewBdAgeingReport(session),false);
});
test('exact elapsed boundaries have no overlaps or gaps above two days',()=>{
  const result=buildBdAgeingReport([row(2*day-1),row(2*day),row(4*day-1),row(4*day),row(6*day),row(6*day+1)],now);
  assert.deepEqual(result.groups.map(group=>group.rows.length),[2,2,1]);
  assert.equal(result.total,5);
  assert.equal(new Set(result.groups.flatMap(group=>group.rows.map(r=>r.ref))).size,5);
  assert.equal(result.groups[1].rows[0].age,'6d 0h 0m');
});
test('exclude closed, verified, idle, archived, invalid dates and future requests',()=>{
  const rows=['Closed','Verified','Idle','Ideal'].map(status=>row(7*day,{status}));
  rows.push(row(7*day,{verifiedAt:'2026-10-05'}),row(7*day,{verificationStatus:'Verified'}),row(7*day,{archivedAt:'2026-10-05'}),row(7*day,{start:'bad'}),row(-day));
  assert.equal(buildBdAgeingReport(rows,now).total,0);
  assert.equal(buildBdAgeingReport([row(7*day,{status:'Open'}),row(5*day,{status:'Running BD'})],now).total,2);
});
test('IST timestamps and UTC timestamps produce identical ages',()=>{
  const result=buildBdAgeingReport([row(2*day,{start:'2026-10-04 12:00:00'}),row(2*day)],now);
  assert.deepEqual(result.groups[0].rows.map(r=>r.ageMilliseconds),[2*day,2*day]);
});
function response(){return {code:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}
test('forbidden API calls cannot query data or impersonate via query/body',async()=>{
  const handler=bdAgeingReportHandler({loadRequests:()=>assert.fail('Forbidden caller queried requests')});
  const res=response();
  await handler({session:{login:'admin',role:'super'},query:{login:'MOHITCHADDA'},body:{login:'MOHITCHADDA'}},res,assert.fail);
  assert.equal(res.code,403);
  assert.equal(res.headers['Cache-Control'],'private, no-store');
});
test('authorized endpoint uses loader-scoped records, returns only report fields and forwards errors',async()=>{
  const session={login:'THAKUR@1990'};
  const res=response();
  await bdAgeingReportHandler({now:()=>now,loadRequests:async received=>{assert.equal(received,session);return {requests:[row(3*day,{secret:'not exported'})],scope:{label:'Majri OC'}};}})({session},res,assert.fail);
  assert.equal(res.body.total,1); assert.equal(res.body.scope.label,'Majri OC');
  assert.equal(res.body.groups[0].rows[0].secret,undefined);
  const failure=new Error('DB failed'); let caught;
  await bdAgeingReportHandler({loadRequests:async()=>{throw failure;}})({session},response(),err=>caught=err);
  assert.equal(caught,failure);
});
test('route requires session, preserves site scope, and UI has independent account guard',()=>{
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  assert.match(server,/app.get\('\/api\/reports\/bd-ageing',requireSession,bdAgeingReportHandler/);
  const route=server.split("app.get('/api/reports/bd-ageing'")[1].split("app.get('/api/requests'")[0];
  assert.match(route,/currentDashboardAuthorization/); assert.match(route,/scopeInfoPulseRequests/); assert.match(route,/archived_at IS NULL/);
  const ui=readFileSync(new URL('../src/bd-ageing-report.jsx',import.meta.url),'utf8');
  assert.match(ui,/if \(!allowed\) return/); assert.match(ui,/AbortController/);
});
