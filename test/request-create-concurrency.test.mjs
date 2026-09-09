import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {activeRequestConflictMessage} from '../request-conflict.mjs';
import {canonicalSiteName} from '../site-location.mjs';
import {parseIndiaRequestDateTime} from '../request-time.mjs';
import {validRequestAudioDataUrl} from '../request-workflow.mjs';
import * as timeline from '../request-timeline.mjs';

const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const auth=source.slice(source.indexOf('async function requireSession('),source.indexOf('async function requireSuper('));
const helpers=source.slice(source.indexOf('async function activeRequestConflict('),source.indexOf("app.get('/api/requests/conflict',"));
const route=source.slice(source.indexOf("app.post('/api/requests',"),source.indexOf("app.patch('/api/requests/:reference',"));
const normalize=value=>String(value||'').trim().toLowerCase();

function harness({initial=[],legacyReadBarrier=false,failInsert=false}={}){
  const saved=structuredClone(initial),queries=[],lockTails=new Map(),clients=[];
  let handlers,reads=0,releaseReads;
  const bothReads=new Promise(resolve=>{releaseReads=resolve;});
  async function query(sql,values,client){
    queries.push({sql,values,client:client?.id});
    if(sql==='BEGIN'){client.inTransaction=true;return {rows:[]};}
    if(sql==='COMMIT'||sql==='ROLLBACK'){
      if(sql==='COMMIT')saved.push(...client.pending);
      client.pending=[];client.inTransaction=false;
      for(const release of client.releases.splice(0))release();
      return {rows:[]};
    }
    if(sql.includes('pg_advisory_xact_lock')){
      assert.ok(client?.inTransaction,'vehicle locks must last through commit');
      const key=values[0],previous=lockTails.get(key)||Promise.resolve();
      let release;
      const current=new Promise(resolve=>{release=resolve;});
      lockTails.set(key,previous.then(()=>current));
      await previous;
      client.releases.push(release);
      client.locks.push(key);
      return {rows:[]};
    }
    if(sql.startsWith('SELECT reference AS ref')){
      const rows=saved.filter(row=>row.status!=='Closed'&&((values[0]&&normalize(row.door)===normalize(values[0]))||(values[1]&&normalize(row.chassis)===normalize(values[1]))));
      // Reproduce the old race deterministically: both pooled prechecks finish
      // reading no conflict before either caller is allowed to insert.
      if(!client&&legacyReadBarrier){if(++reads===2)releaseReads();await bothReads;}
      return {rows:rows.slice(0,1)};
    }
    assert.ok(sql.startsWith('INSERT INTO maintenance_requests'),`Unexpected query ${sql}`);
    if(failInsert)throw Error('Simulated database insert failure');
    if(saved.some(row=>row.ref===values[0]))throw Object.assign(Error('duplicate reference'),{code:'23505',constraint:'maintenance_requests_reference_key'});
    const row={ref:values[0],door:values[3],chassis:values[5],site:values[9],owner:values[14],requesterLogin:values[15],status:'Open'};
    if(client){assert.ok(client.inTransaction);client.pending.push(row);}else saved.push(row);
    return {rows:[structuredClone(row)],rowCount:1};
  }
  const pool={query:(sql,values)=>query(sql,values),async connect(){
    const client={id:clients.length+1,pending:[],releases:[],locks:[],inTransaction:false,released:false,
      query:(sql,values)=>query(sql,values,client),release(){assert.equal(this.inTransaction,false);this.released=true;}};
    clients.push(client);return client;
  }};
  const context={
    ...timeline,recordRequestTimeline:async()=>{},maintenanceWriteFailure:(error,res,next)=>error.status?res.status(error.status).json({error:error.message,code:error.code}):next(error),
    app:{post(_path,...chain){handlers=chain;}},pool,readSession:async req=>req.testSession,currentUserRecord:async()=>({site:'Sasti OB'}),
    canonicalSiteName,parseIndiaRequestDateTime,validRequestAudioDataUrl,activeRequestConflictMessage,requestProjection:'*',
    sendRequestEventReports:async()=>{},requestStakeholderLogins:async()=>[],requestWorkflowWhatsAppLogins:async()=>[],
    addTicketNotificationsBestEffort:async()=>{},requestEquipmentNotificationDetails:()=>'',requestNotificationTime:()=>'',
    workflowRequestLink:()=>'',publicBaseUrl:()=>'',console,
  };
  runInNewContext(`${auth}\n${helpers}\n${route}`,context);
  return {saved,queries,clients,async create(body={}){
    const req={testSession:{role:'normal',assignedRole:'Production User',name:'Local operator',login:'local',permissions:{createRequests:true}},body:{ref:'REQ-LOCAL-A',door:'DOOR-1',chassis:'CHASSIS-1',site:'Sasti OB',complaint:'Local concurrency test',start:'2026-09-08 10:00:00',meterType:'HMR',...body}};
    const res={statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
    for(const handler of handlers){let next=false,error;await handler(req,res,value=>{next=true;error=value;});if(error)throw error;if(!next)break;}
    return {status:res.statusCode,body:res.body};
  }};
}

test('simultaneous matching vehicle submissions have exactly one committed winner',async()=>{
  for(const variant of [
    {door:'DOOR-1',chassis:'CHASSIS-1'},
    {door:' door-1 ',chassis:' chassis-1 '},
    {door:'DOOR-1',chassis:'DIFFERENT-CHASSIS'},
    {door:'DIFFERENT-DOOR',chassis:'CHASSIS-1'},
  ]){
    const app=harness({legacyReadBarrier:true});
    const results=await Promise.all([app.create(),app.create({ref:'REQ-LOCAL-B',...variant})]);
    assert.deepEqual(results.map(result=>result.status).sort(),[201,409]);
    assert.equal(app.saved.length,1);
    const conflict=results.find(result=>result.status===409);
    assert.equal(conflict.body.duplicate,true);
    assert.equal(conflict.body.existingReference,app.saved[0].ref);
    assert.ok(app.clients.every(client=>client.released));
    assert.equal(app.queries.filter(item=>item.sql.startsWith('SELECT reference AS ref')&&!item.client).length,0,'conflict recheck must use the lock-holding client');
  }
});

test('unrelated vehicles can be created concurrently and locks are stable normalized keys',async()=>{
  const app=harness();
  const results=await Promise.all([app.create(),app.create({ref:'REQ-LOCAL-B',door:'OTHER-DOOR',chassis:'OTHER-CHASSIS'})]);
  assert.deepEqual(results.map(result=>result.status),[201,201]);
  assert.equal(app.saved.length,2);
  for(const client of app.clients){assert.deepEqual(client.locks,[...client.locks].sort());assert.ok(client.locks.every(key=>key===key.toLowerCase()));assert.ok(client.released);}
  assert.equal(new Set(app.clients.flatMap(client=>client.locks)).size,4);
});

test('active and Idle requests remain conflicts while Closed history permits a new request',async()=>{
  for(const status of ['Open','In progress','Awaiting parts','Idle','Ideal']){
    const existing={ref:'REQ-EXISTING',door:'DOOR-1',chassis:'CHASSIS-1',status};
    const app=harness({initial:[existing]});
    assert.equal((await app.create()).status,409);
    assert.deepEqual(app.saved,[existing]);
  }
  const closed={ref:'REQ-HISTORY',door:'DOOR-1',chassis:'CHASSIS-1',status:'Closed'};
  const app=harness({initial:[closed]});
  assert.equal((await app.create()).status,201);
  assert.equal(app.saved.length,2);
  assert.deepEqual(app.saved[0],closed);
});

test('duplicate references return an actionable conflict and preserve the original record',async()=>{
  const original={ref:'REQ-LOCAL-A',door:'OTHER-DOOR',chassis:'OTHER-CHASSIS',status:'Closed'};
  const app=harness({initial:[original]});
  const result=await app.create();
  assert.equal(result.status,409);
  assert.equal(result.body.code,'REQUEST_REFERENCE_CONFLICT');
  assert.match(result.body.error,/reference.*already exists.*[Rr]efresh/);
  assert.deepEqual(app.saved,[original]);
  assert.ok(app.clients.every(client=>client.released));
  assert.ok(app.queries.some(({sql})=>sql==='ROLLBACK'));
});

test('failed insert rolls back and releases transaction locks without fabricating a saved request',async()=>{
  const app=harness({failInsert:true});
  await assert.rejects(app.create(),/Simulated database insert failure/);
  assert.deepEqual(app.saved,[]);
  assert.ok(app.queries.some(({sql})=>sql==='ROLLBACK'));
  assert.ok(app.clients.every(client=>client.released));
});
