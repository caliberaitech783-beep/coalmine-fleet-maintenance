import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {canonicalSiteName} from '../site-location.mjs';
import {parseIndiaRequestDateTime} from '../request-time.mjs';
import {validRequestAudioDataUrl} from '../request-workflow.mjs';

const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const auth=source.slice(source.indexOf('async function requireSession('),source.indexOf('async function requireSuper('));
const creationGuard=source.slice(source.indexOf('async function createRequestWithVehicleLock('),source.indexOf("app.get('/api/requests/conflict',"));
const route=source.slice(source.indexOf("app.post('/api/requests',"),source.indexOf("app.patch('/api/requests/:reference',"));
const production={role:'normal',assignedRole:'Production User',name:'Stupal Moon',login:'Stupal',permissions:{createRequests:true}};

async function create({user={site:'Sasti OB'},session=production,body={}}={}){
  let handlers;
  const calls=[];
  const context={
    app:{post(_path,...chain){handlers=chain;}},readSession:async req=>req.testSession,
    currentUserRecord:async()=>user,canonicalSiteName,parseIndiaRequestDateTime,validRequestAudioDataUrl,
    activeRequestConflict:async payload=>{calls.push({kind:'conflict',payload});return null;},requestProjection:'*',
    pool:{async query(sql,values){
      if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)||sql.includes('pg_advisory_xact_lock'))return {rows:[]};
      assert.ok(sql.startsWith('INSERT INTO maintenance_requests'));
      calls.push({kind:'insert',sql,values});
      return {rows:[{ref:values[0],site:values[9],driverName:values[6],driverNameSource:values[7],owner:values[14],requesterLogin:values[15],status:'Open'}]};
    }},
    sendRequestEventReports:async()=>{},requestStakeholderLogins:async()=>[],requestWorkflowWhatsAppLogins:async()=>[],
    addTicketNotificationsBestEffort:async()=>{},requestEquipmentNotificationDetails:()=>'',requestNotificationTime:()=>'',
    workflowRequestLink:()=>'',publicBaseUrl:()=>'',console,
  };
  context.pool.connect=async()=>({query:context.pool.query,release(){}});
  runInNewContext(`${auth}\n${creationGuard}\n${route}`,context);
  const req={testSession:session,body:{ref:'REQ-LOCAL-CREATE',door:'LOCAL-01',chassis:'LOCAL-CHASSIS',site:'Sasti OB',complaint:'Isolated test',start:'2026-09-08 10:00:00',meterType:'HMR',...body}};
  const res={statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
  for(const handler of handlers){
    let advanced=false,error;
    await handler(req,res,value=>{advanced=true;error=value;});
    if(error)throw error;
    if(!advanced)break;
  }
  return {status:res.statusCode,body:res.body,calls};
}

test('normal users cannot create other-site or unassigned requests, even through a forged client payload',async()=>{
  for(const assignedRole of ['Production User','Maintenance User'])for(const [user,body] of [
    [{site:'Sasti OB'},{site:'Majri OB'}],
    [{},{site:'Sasti OB'}],
    [{site:'Sasti OB'},{site:''}],
  ]){
    const result=await create({session:{...production,assignedRole},user,body});
    assert.equal(result.status,403);
    assert.match(result.body.error,/assigned location/);
    assert.equal(result.calls.length,0,'reject before cross-site conflict lookup or insertion');
  }
});

test('canonical site aliases and location/currentLocation profile fallbacks permit valid local creation',async()=>{
  for(const user of [{site:'SASTI'},{location:' sasti ob '},{currentLocation:'Sasti OB'}]){
    const result=await create({user});
    assert.equal(result.status,201);
    assert.equal(result.body.owner,'Stupal Moon');
    assert.equal(result.body.requesterLogin,'stupal');
    assert.equal(result.calls.filter(call=>call.kind==='insert').length,1);
  }
});

test('authorized Super/Admin creation remains available without an operational site constraint',async()=>{
  for(const adminLevel of ['Admin','Super Admin']){
    const result=await create({user:{},session:{...production,role:'super',permissions:{adminLevel,createRequests:true}},body:{site:'Majri OB'}});
    assert.equal(result.status,201);
    assert.equal(result.body.site,'Majri OB');
  }
  const forbidden=await create({session:{...production,permissions:{createRequests:false}}});
  assert.equal(forbidden.status,403);
  assert.equal(forbidden.calls.length,0);
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
