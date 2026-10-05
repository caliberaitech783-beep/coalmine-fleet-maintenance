import * as siteAccess from '../region-scope.mjs';
import {requestShiftLabel} from '../request-shift.mjs';
import {SHIFT_MASTER_DEFAULTS} from '../shift-master.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {canonicalSiteName} from '../site-location.mjs';
import {parseIndiaRequestDateTime} from '../request-time.mjs';
import {validRequestAudioDataUrl} from '../request-workflow.mjs';
import * as timeline from '../request-timeline.mjs';

const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const auth=source.slice(source.indexOf('async function requireSession('),source.indexOf('async function requireSuper('));
const creationGuard=source.slice(source.indexOf('async function createRequestWithVehicleLock('),source.indexOf("app.get('/api/requests/conflict',"));
const route=source.slice(source.indexOf("app.post('/api/requests',"),source.indexOf("app.patch('/api/requests/:reference',"));
const production={role:'normal',assignedRole:'Production User',name:'Stupal Moon',login:'Stupal',permissions:{createRequests:true}};

async function create({user={site:'Sasti OC'},session=production,body={}}={}){
  let handlers;
  const calls=[],followups=[];
  const context={
    requestShiftLabel,setImmediate:callback=>followups.push(callback),
    ...timeline,recordRequestTimeline:async()=>{},maintenanceWriteFailure:(error,res,next)=>error.status?res.status(error.status).json({error:error.message,code:error.code}):next(error),
    app:{post(_path,...chain){handlers=chain;}},readSession:async req=>req.testSession,
    ...siteAccess,currentUserRecord:async()=>user,canonicalSiteName,parseIndiaRequestDateTime,validRequestAudioDataUrl,
    activeRequestConflict:async payload=>{calls.push({kind:'conflict',payload});return null;},requestProjection:'*',
    pool:{async query(sql,values){
      if(sql.includes("master_name='Shift Master'"))return {rows:SHIFT_MASTER_DEFAULTS.map(record_data=>({record_data}))};
      if(sql.startsWith('UPDATE maintenance_requests SET request_shift')){calls.push({kind:'shift',values});return {rows:[]};}
      if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)||sql.includes('pg_advisory_xact_lock'))return {rows:[]};
      assert.ok(sql.startsWith('INSERT INTO maintenance_requests'));
      calls.push({kind:'insert',sql,values});
      return {rows:[{ref:values[0],site:values[9],driverName:values[6],driverNameSource:values[7],owner:values[14],requesterLogin:values[15],requesterRole:values[16],status:'Open'}]};
    }},
    sendRequestEventReports:async()=>{},requestStakeholderLogins:async()=>[],requestWorkflowWhatsAppLogins:async()=>[],
    addTicketNotificationsBestEffort:async()=>{},requestEquipmentNotificationDetails:()=>'',requestNotificationTime:()=>'',
    workflowRequestLink:()=>'',publicBaseUrl:()=>'',console,
  };
  context.pool.connect=async()=>({query:context.pool.query,release(){}});
  runInNewContext(`${auth}\n${creationGuard}\n${route}`,context);
  const req={testSession:session,body:{ref:'REQ-LOCAL-CREATE',door:'LOCAL-01',chassis:'LOCAL-CHASSIS',site:'Sasti OC',complaint:'Isolated test',start:'2026-09-08 10:00:00',meterType:'HMR',...body}};
  const res={statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
  for(const handler of handlers){
    let advanced=false,error;
    await handler(req,res,value=>{advanced=true;error=value;});
    if(error)throw error;
    if(!advanced)break;
  }
  for(const followup of followups)await followup();
  return {status:res.statusCode,body:res.body,calls};
}

test('normal users cannot create other-site or unassigned requests, even through a forged client payload',async()=>{
  for(const assignedRole of ['Production User','Maintenance User'])for(const [user,body] of [
    [{site:'Sasti OC'},{site:'Majri OC'}],
    [{},{site:'Sasti OC'}],
    [{site:'Sasti OC'},{site:''}],
  ]){
    const result=await create({session:{...production,assignedRole},user,body});
    assert.equal(result.status,403);
    assert.match(result.body.error,/assigned location/);
    assert.equal(result.calls.length,0,'reject before cross-site conflict lookup or insertion');
  }
});

test('both creation roles receive a server-assigned shift, ignoring a forged choice',async()=>{
  for(const assignedRole of ['Production User','Maintenance User']){
    const result=await create({session:{...production,assignedRole},body:{start:'2026-09-08 14:00:00',requestShift:'Shift A'}});
    assert.equal(result.status,201);
    assert.equal(result.body.requestShift,'Shift B');
    assert.equal(result.calls.find(call=>call.kind==='shift').values[1],'Shift B');
  }
});

test('canonical site aliases and location/currentLocation profile fallbacks permit valid local creation',async()=>{
  for(const user of [{site:'SASTI'},{location:' sasti ob '},{currentLocation:'Sasti OC'}]){
    const result=await create({user});
    assert.equal(result.status,201);
    assert.equal(result.body.owner,'Stupal Moon');
    assert.equal(result.body.requesterLogin,'stupal');
    assert.equal(result.body.requesterRole,'Production User');
    assert.equal(result.calls.filter(call=>call.kind==='insert').length,1);
  }
});

test('each selected site accepts a request while an excluded site is rejected',async()=>{
  const user={site:'Sasti OC | Jayant OC',managerRegion:'All'};
  for(const assignedRole of ['Production User','Maintenance User'])for(const site of ['Sasti OC','Jayant OC','Majri OC']){
    const result=await create({user,session:{...production,assignedRole},body:{site}});
    assert.equal(result.status,site==='Majri OC'?403:201,`${assignedRole}: ${site}`);
    assert.equal(result.calls.filter(call=>call.kind==='insert').length,site==='Majri OC'?0:1);
  }
});

test('authorized Super/Admin creation remains available without an operational site constraint',async()=>{
  for(const adminLevel of ['Admin','Super Admin']){
    const result=await create({user:{},session:{...production,role:'super',permissions:{adminLevel,createRequests:true}},body:{site:'Majri OC'}});
    assert.equal(result.status,201);
    assert.equal(result.body.site,'Majri OC');
  }
  const forbidden=await create({session:{...production,permissions:{createRequests:false}}});
  assert.equal(forbidden.status,403);
  assert.equal(forbidden.calls.length,0);
});

test('chassis is optional while door identity and site restrictions remain enforced',async()=>{
  for(const chassis of ['',undefined,'CH-123']){
    const result=await create({body:{chassis}});
    assert.equal(result.status,201);
    assert.equal(result.calls.find(call=>call.kind==='insert').values[5],chassis || '');
  }
  assert.equal((await create({body:{chassis:'',door:''}})).status,400);
  assert.equal((await create({body:{chassis:'',site:'Majri OC'}})).status,403);
});

test('missing driver lookup data remains empty rather than inventing a driver or a source',async()=>{
  for(const body of [{},{driverName:'  ',driverNameSource:'Oracle'}]){
    const result=await create({body});
    assert.equal(result.status,201);
    assert.equal(result.body.driverName,'');
    assert.equal(result.body.driverNameSource,'');
  }
  assert.doesNotMatch(route,/\|\|'Demo Driver'|storedDriverName==='Demo Driver'/);
});

test('genuine supplied driver details and source are retained for new requests',async()=>{
  const oracle=await create({body:{driverName:'  Sample operator  ',driverNameSource:' Oracle '}});
  assert.equal(oracle.body.driverName,'Sample operator');
  assert.equal(oracle.body.driverNameSource,'Oracle');
  const manual=await create({body:{driverName:'Sample operator'}});
  assert.equal(manual.body.driverName,'Sample operator');
  assert.equal(manual.body.driverNameSource,'Manual');
});
