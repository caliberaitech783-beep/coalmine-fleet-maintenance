import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as timeline from '../request-timeline.mjs';
import {canonicalSiteName} from '../site-location.mjs';
import {managerReportScope,reportScopeIncludesSite} from '../region-scope.mjs';

const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const slice=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end));
const common=slice('const requestTimelineProjection=',"app.post('/api/requests/:reference/daily-remarks'");
const routes={
  edit:slice("app.patch('/api/requests/:reference',","app.patch('/api/requests/:reference/close',"),
  close:slice("app.patch('/api/requests/:reference/close',","app.patch('/api/requests/:reference/ideal-onroad',"),
  verify:slice("app.patch('/api/requests/:reference/verify',","app.get('/api/requests/:reference/trip-card',"),
};
const now=new Date('2026-09-08T12:00:00Z');
const active={ref:'REQ-TIMELINE',timelineRequestId:'41',site:'Sasti OB',requesterLogin:'production',status:'In progress',start:new Date('2026-09-08T08:00:00Z'),acceptedAt:new Date('2026-09-08T09:00:00Z'),acceptanceRequired:true,expectedCompletionAt:new Date('2026-09-08T13:00:21.321Z'),closedAt:null,firstTripAt:null,verifiedAt:null,meter_type:'HMR',opening_meter_reading:'',opening_meter_file:'',arrivalFlaggedAt:'2026-09-08T09:00:00Z',arrivalFlagRemark:'Existing delay reason'};
const maintenance={role:'normal',assignedRole:'Maintenance User',name:'Fixture maintenance',login:'maintenance',permissions:{editRequests:true,closeRequests:true}};
const mis={role:'normal',assignedRole:'MIS User',name:'Fixture MIS',login:'mis',permissions:{verifyRequests:true}};
const current=row=>({...structuredClone(row),timelineRecordedAt:now});

function harness(kind,{row=active,session=kind==='verify'?mis:maintenance,user={site:'Sasti OB'},auditFailure=false,history=[],noAccount=false}={}){
  let saved=structuredClone(row),audits=structuredClone(history),snapshot,registered,tx=false,released=false;
  const queries=[];
  const client={async query(sql,args=[]){
    queries.push({sql,args,tx});
    if(sql==='BEGIN'){assert.equal(tx,false);tx=true;snapshot={saved:structuredClone(saved),audits:structuredClone(audits)};return {rows:[]};}
    if(sql==='COMMIT'){tx=false;return {rows:[]};}
    if(sql==='ROLLBACK'){saved=snapshot.saved;audits=snapshot.audits;tx=false;return {rows:[]};}
    if(sql.startsWith('SELECT changed_fields')){
      assert.ok(sql.includes('changed_fields @> $2::jsonb'),'history is bound to immutable row ID');
      assert.equal(JSON.parse(args[1])[0].requestId,String(saved.timelineRequestId));
      // Deliberately return mixed request IDs too: the response sanitizer must
      // still prevent deleted/reused-reference history from escaping.
      return {rows:audits.map(changed_fields=>({changed_fields}))};
    }
    if(sql.startsWith('INSERT INTO audit_events')){
      assert.equal(tx,true,'history insert must share the workflow transaction');
      assert.equal(args[0],session.login);assert.equal(args[1],session.name);
      if(auditFailure)throw Error('Audit store unavailable');
      audits.push(JSON.parse(args[5]));return {rows:[],rowCount:1};
    }
    if(sql.startsWith('SELECT meter_type'))return {rows:[{...current(saved),expected_completion_at:saved.expectedCompletionAt}]};
    if(sql.startsWith('SELECT ')){
      if(!saved)return {rows:[]};
      if(sql.includes('FOR UPDATE'))assert.equal(tx,true);
      return {rows:[{...current(saved),arrival_flag_ready:true}]};
    }
    if(sql.startsWith('INSERT INTO master_records'))return {rows:[],rowCount:1};
    assert.ok(sql.startsWith('UPDATE maintenance_requests'),`Unexpected SQL: ${sql}`);
    assert.equal(tx,true,'all timestamp writes are transactional');
    if(sql.includes('SET category=')){
      saved.complaint=args[1];saved.expectedCompletionAt=args[2];
      if(saved.acceptanceRequired&&!saved.acceptedAt){saved.acceptedAt=now;saved.acceptedBy=args[7];}
    }else if(sql.includes("SET verification_status='Verified'")){
      saved.verifiedAt=now;saved.verifiedBy=args[0];saved.firstTripAt=args[2];saved.firstTripDone=args[1];
    }else if(sql.includes('SET closed_at=$1')){saved.closedAt=args[0];saved.status='Closed';saved.closedBy=args[1];}
    else if(sql.includes("SET meter_type=CASE")){saved.opening_meter_reading=args[1];}
    else if(sql.includes("status='Idle'")){saved.status='Idle';saved.idealRequestedAt=now;}
    else saved.status=args[2];
    return {rows:[current(saved)],rowCount:1};
  },release(){assert.equal(tx,false);released=true;}};
  const context={...timeline,Date,app:{get(path,...handlers){if(kind==='timeline')registered=handlers;},patch(path,...handlers){registered=handlers;}},
    requireSession:(req,res,next)=>next(),requirePermission:()=>((req,res,next)=>next()),
    currentDashboardAuthorization:async()=>noAccount?null:{session:{role:session.role,assignedRole:session.assignedRole,permissions:session.permissions},user},currentUserRecord:async()=>user,
    pool:{query:client.query,connect:async()=>client},requestProjection:'*',canonicalSiteName,managerReportScope,reportScopeIncludesSite,
    validTripCardImageDataUrl:()=>true,validMeterReading:()=>true,validMeterEvidenceDataUrl:()=>true,validRequestAudioDataUrl:()=>true,
    REQUEST_CLOSE_STATUSES:['Closed','In progress','Awaiting parts'],delayedReasonRequired:()=>false,
    sendRequestEventReports:async()=>{},requestStakeholderLogins:async()=>[],requestWorkflowWhatsAppLogins:async()=>[],addTicketNotificationsBestEffort:async()=>{},
    requestEquipmentNotificationDetails:()=>'',requestNotificationTime:()=>'',workflowRequestLink:()=>'',publicBaseUrl:()=>'',console:{error(){}},
  };
  runInNewContext(`${common}\n${routes[kind]||''}`,context);
  return {queries,get saved(){return saved;},get audits(){return audits;},get released(){return released;},async call(body={}){
    const req={session,params:{reference:'REQ-TIMELINE'},body:{complaint:'Original complaint',expectedCompletionAt:'2026-09-08T18:30',meterType:'HMR',closingDate:'2026-09-08',closingTime:'17:00:00',maintenanceWork:'Fixture work',status:'Closed',firstTripDone:true,firstTripDate:'2026-09-08',firstTripTime:'17:00:00',firstTripCardImage:'fixture',closingMeterReading:'123',...body}};
    const res={statusCode:200,headers:{},set(key,value){this.headers[key]=value;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
    for(const handler of registered){let next=false,error;await handler(req,res,value=>{next=true;error=value;});if(error)throw error;if(!next)break;}
    return {status:res.statusCode,body:res.body,headers:res.headers};
  }};
}

test('ETC no-op retains original seconds and legacy provenance; changed ETC needs a reason before any write',async()=>{
  const unchanged=harness('edit');assert.equal((await unchanged.call()).status,200);
  assert.equal(unchanged.saved.expectedCompletionAt.getTime(),active.expectedCompletionAt.getTime());assert.equal(unchanged.audits.length,0);
  for(const correctionReason of ['', ' \t\n ']){
    const app=harness('edit');const result=await app.call({expectedCompletionAt:'2026-09-08T19:30',correctionReason});
    assert.equal(result.status,400);assert.equal(result.body.code,'TIMELINE_CORRECTION_REASON_REQUIRED');
    assert.equal(app.queries.some(row=>row.sql.startsWith('UPDATE')),false);assert.deepEqual(app.saved,active);
  }
});

test('ETC correction appends exact original/new values and server actor/reason without rewriting prior history',async()=>{
  const prior=[{event:'expectedCompletionAt',oldValue:null,newValue:'2026-09-08T13:00:21.321Z',source:'user',requestId:'41'}];
  const app=harness('edit',{history:[prior]});const result=await app.call({expectedCompletionAt:'2026-09-08T19:30',correctionReason:'  Parts delivery revised  ',timelineHistory:[{source:'system',actorName:'forged'}]});
  assert.equal(result.status,200);assert.deepEqual(app.audits[0],prior);assert.equal(app.audits.length,2);
  const saved=app.audits[1][0];
  assert.equal(saved.oldValue,'2026-09-08T13:00:21.321Z');assert.equal(saved.newValue,'2026-09-08T14:00:00.000Z');
  assert.equal(saved.actorLogin,'maintenance');assert.equal(saved.actorName,'Fixture maintenance');assert.equal(saved.source,'user');
  assert.equal(saved.reason,'Parts delivery revised');assert.equal(saved.recordedAt,now.toISOString());assert.equal(saved.correction,true);assert.equal(saved.requestId,'41');
});

test('initial acceptance records independent system capture and user-entered ETC provenance atomically',async()=>{
  const app=harness('edit',{row:{...active,acceptedAt:null,expectedCompletionAt:null}});
  assert.equal((await app.call()).status,200);assert.equal(app.audits.length,1);
  assert.deepEqual(app.audits[0].map(row=>[row.event,row.source,row.correction]),[['acceptedAt','system',false],['expectedCompletionAt','user',false]]);
  assert.ok(app.queries.findIndex(row=>row.sql.startsWith('INSERT INTO audit_events'))<app.queries.findIndex(row=>row.sql==='COMMIT'));
});

test('timeline storage failure rolls back acceptance/ETC mutation and retains existing audit records',async()=>{
  const app=harness('edit',{row:{...active,acceptedAt:null,expectedCompletionAt:null},auditFailure:true,history:[[{event:'start',requestId:'41'}]]});
  await assert.rejects(app.call(),/Audit store unavailable/);
  assert.equal(app.saved.acceptedAt,null);assert.equal(app.saved.expectedCompletionAt,null);assert.equal(app.audits.length,1);assert.equal(app.released,true);
  assert.ok(app.queries.some(row=>row.sql==='ROLLBACK'));assert.equal(app.queries.some(row=>row.sql==='COMMIT'),false);
});

test('closing before acceptance, future close and impossible calendar date reject before meter/status writes',async()=>{
  for(const body of [{closingTime:'14:00:00'},{closingTime:'18:00:00'},{closingDate:'2026-02-31'}]){
    const app=harness('close');const result=await app.call({...body,openingMeterReading:'999'});
    assert.equal(result.status,400);assert.equal(app.queries.some(row=>row.sql.startsWith('UPDATE')),false);assert.deepEqual(app.saved,active);assert.equal(app.audits.length,0);
  }
});

test('valid close and MIS first-trip capture keep actual event time separate from server recorded time',async()=>{
  const close=harness('close');assert.equal((await close.call()).status,200);
  assert.equal(close.audits[0][0].event,'closedAt');assert.equal(close.audits[0][0].newValue,'2026-09-08T11:30:00.000Z');assert.equal(close.audits[0][0].recordedAt,now.toISOString());assert.equal(close.audits[0][0].source,'user');
  const verify=harness('verify',{row:{...active,status:'Closed',closedAt:new Date('2026-09-08T10:00:00Z')}});
  assert.equal((await verify.call()).status,200);
  assert.deepEqual(verify.audits[0].map(row=>[row.event,row.source]),[['firstTripAt','user'],['verifiedAt','system']]);
  assert.ok(new Date(verify.audits[0][0].newValue)<new Date(verify.audits[0][1].newValue));
});

test('MIS first trip cannot precede closure or lie in the future, and failure cannot save verification',async()=>{
  for(const firstTripTime of ['14:00:00','18:00:00']){
    const app=harness('verify',{row:{...active,status:'Closed',closedAt:new Date('2026-09-08T10:00:00Z')}});
    const result=await app.call({firstTripTime});assert.equal(result.status,400);assert.equal(result.body.code,'INVALID_REQUEST_TIMELINE');
    assert.equal(app.saved.verifiedAt,null);assert.equal(app.audits.length,0);assert.equal(app.queries.some(row=>row.sql.startsWith('UPDATE')),false);
  }
});

test('unrelated legacy inconsistencies do not block a normal unchanged ETC edit',async()=>{
  const row={...active,start:new Date('2026-09-08T10:00:00Z'),acceptedAt:new Date('2026-09-08T09:00:00Z')};
  const app=harness('edit',{row});assert.equal((await app.call({complaint:'Clarification only'})).status,200);assert.equal(app.audits.length,0);
  assert.equal(app.saved.start.getTime(),row.start.getTime());assert.equal(app.saved.acceptedAt.getTime(),row.acceptedAt.getTime());
});

test('rare existing legacy closure and first-trip changes or clearing require their own reason before mutation',async()=>{
  for(const [kind,row,body,event] of [
    ['close',{...active,closedAt:new Date('2026-09-08T10:00:00Z')},{},'closedAt'],
    ['verify',{...active,status:'Closed',closedAt:new Date('2026-09-08T10:00:00Z'),firstTripAt:new Date('2026-09-08T11:00:00Z')},{},'firstTripAt'],
    ['verify',{...active,status:'Closed',closedAt:new Date('2026-09-08T10:00:00Z'),firstTripAt:new Date('2026-09-08T11:00:00Z')},{firstTripDone:false},'firstTripAt'],
  ]){
    const denied=harness(kind,{row});const result=await denied.call(body);
    assert.equal(result.status,400);assert.equal(result.body.code,'TIMELINE_CORRECTION_REASON_REQUIRED');
    assert.match(result.body.error,event==='closedAt'?/maintenance closure/i:/first trip/i);
    assert.equal(denied.queries.some(row=>row.sql.startsWith('UPDATE')),false);assert.deepEqual(denied.saved,row);
    const approved=harness(kind,{row});assert.equal((await approved.call({...body,correctionReason:'Original legacy time was checked against the work record.'})).status,200);
    const change=approved.audits.flat().find(item=>item.event===event);
    assert.equal(change.oldValue,row[event].toISOString());assert.equal(change.correction,true);assert.equal(change.reason,'Original legacy time was checked against the work record.');
    if(body.firstTripDone===false)assert.equal(change.newValue,null);
  }
});

test('timeline endpoint rechecks current account, role, ownership and assigned site before reading history',async()=>{
  const cases=[
    {noAccount:true,status:401},
    {user:{site:'Jayant OB'},status:403},
    {user:{},status:403},
    {session:{role:'normal',assignedRole:'Production User',login:'someone-else'},status:403},
    {session:{role:'normal',assignedRole:'Unknown',login:'x',permissions:{}},status:403},
    {session:{role:'super',permissions:{adminLevel:'Manager'}},user:{managerSites:'Jayant OB'},status:403},
  ];
  for(const options of cases){const app=harness('timeline',options);assert.equal((await app.call()).status,options.status);assert.equal(app.queries.some(row=>row.sql.startsWith('SELECT changed_fields')),false);}
  for(const options of [{},{session:mis},{session:{role:'normal',assignedRole:'Production User',login:'production'}},{session:{role:'super',permissions:{adminLevel:'Manager'}},user:{managerSites:'Sasti OB'}},{session:{role:'super',permissions:{adminLevel:'Admin'}},user:{}}])assert.equal((await harness('timeline',options).call()).status,200);
});

test('timeline exposes only safe history bound to the current immutable request, never reused-ref or network audit metadata',async()=>{
  const item={event:'acceptedAt',newValue:active.acceptedAt.toISOString(),oldValue:null,source:'system',recordedAt:now.toISOString(),actorName:'Saved actor',actorLogin:'saved',correction:false,reason:'',requestId:'41',ip_address:'private',device_id:'private',session_id:'private'};
  const app=harness('timeline',{history:[[{...item,requestId:'deleted-row',actorName:'Old private actor'}],[item]]});
  const result=await app.call();assert.equal(result.status,200);assert.equal(result.headers['Cache-Control'],'no-store');
  assert.equal(result.body.history.length,1);assert.equal(result.body.history[0].actorName,'Saved actor');
  assert.equal(result.body.events.find(row=>row.event==='acceptedAt').source,'system');assert.equal(result.body.events.find(row=>row.event==='start').source,'unknown');
  const serialized=JSON.stringify(result.body);for(const secret of ['ip_address','device_id','session_id','Old private actor','requestId','timelineRequestId'])assert.equal(serialized.includes(secret),false);
});
