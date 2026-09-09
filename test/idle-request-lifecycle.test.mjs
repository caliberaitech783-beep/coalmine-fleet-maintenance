import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {managerRoleSelection} from '../admin-access.mjs';
import {flowDesignationForUser} from '../hierarchy-report-flow.mjs';
import {managerReportScope,reportScopeIncludesSite} from '../region-scope.mjs';
import {canonicalSiteName} from '../site-location.mjs';
import {arrivalRedFlagRequired} from '../request-acceptance.mjs';
import {requestDateTimeValue,requestMayBeChanged,requestMayBeVerified,validMeterReading,validMeterReadings,validTripCardImageDataUrl} from '../request-workflow.mjs';
import * as timeline from '../request-timeline.mjs';

const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const slice=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end));
const auth=slice('async function requireSession(','async function requireSuper(');
const bestEffort=slice('async function addTicketNotificationsBestEffort(','let consolidatedReportRunning=');
const timelineTransaction=slice('async function withRequestTimelineTransaction(',"app.get('/api/requests/:reference/timeline'");
const routes={
  approve:slice("app.patch('/api/requests/:reference/ideal-onroad',","app.patch('/api/requests/:reference/idle-cancel',"),
  cancel:slice("app.patch('/api/requests/:reference/idle-cancel',","app.delete('/api/requests/:reference',"),
  verify:slice("app.patch('/api/requests/:reference/verify',","app.get('/api/requests/:reference/trip-card',"),
};
const now='2026-09-08T12:00:00.000Z';
const maintenanceManager={role:'super',name:'MAIMaintenance Manager',permissions:{adminLevel:'Manager',managerRoles:['Maintenance Manager']}};
const misSession={role:'normal',assignedRole:'MIS User',name:'Damini Rai',permissions:{verifyRequests:true}};
const pending=Object.freeze({
  ref:'REQ-LOCAL-IDLE',site:'Sasti OB',status:'Idle',owner:'Stupal Moon',requesterLogin:'stupal',
  start:'2026-09-08T08:00:00.000Z',acceptanceRequired:true,acceptedAt:'2026-09-08T09:05:00.000Z',acceptedBy:'Sanskar Manohare',
  arrivalFlaggedAt:'2026-09-08T09:02:00.000Z',arrivalFlaggedBy:'Sanskar Manohare',arrivalFlagRemark:'Recovery vehicle delayed',
  idleReason:'No work',idealRequestedAt:'2026-09-08T10:00:00.000Z',idealRequestedBy:'Sanskar Manohare',idealApprovedAt:null,idealApprovedBy:'',
  maintenanceWork:'Inspection completed',closedAt:null,closedBy:'',verifiedAt:null,verifiedBy:'',verificationStatus:'Pending',
  dailyRemarks:[{remark:'Vehicle arrived',authorName:'Sanskar Manohare'}],misFlaggedAt:null,misFlagRemark:'',
});

// Execute the real route/auth/notification functions against an isolated in-memory
// query adapter. SQL guards are asserted separately; no server or database boots.
function harness(kind,{row=pending,user={site:'Sasti OB'},notificationFailure='',beforeUpdate}={}){
  let saved=structuredClone(row),snapshot,chain,mutations=0;
  const queries=[],logs=[],notifications=[];
  const eligible=value=>value&&!value.verifiedAt&&(kind==='verify'?value.status==='Closed':['Idle','Ideal'].includes(value.status));
  const context={
    ...timeline,requestTimelineProjection:'*',recordRequestTimeline:async()=>{},maintenanceWriteFailure:(error,res,next)=>error.status?res.status(error.status).json({error:error.message,code:error.code}):next(error),
    app:{patch(_path,...handlers){chain=handlers;}},readSession:async req=>req.testSession,
    currentUserRecord:async()=>user,flowDesignationForUser,managerRoleSelection,canonicalSiteName,
    userManagesSite:(manager,site)=>reportScopeIncludesSite(managerReportScope(manager),site),
    requestProjection:'*',requestDateTimeValue,validTripCardImageDataUrl,validMeterReading,validMeterReadings,
    pool:{async query(sql,values){
      queries.push({sql,values});
      if(sql==='BEGIN'){snapshot=structuredClone(saved);return {rows:[]};}
      if(sql==='COMMIT')return {rows:[]};
      if(sql==='ROLLBACK'){saved=snapshot;return {rows:[]};}
      if(sql.startsWith('SELECT site,status,'))return {rows:saved?[{...saved,timelineRecordedAt:new Date(now)}]:[]};
      if(sql.startsWith('SELECT site FROM maintenance_requests'))return {rows:eligible(saved)?[{site:saved.site}]:[]};
      if(sql.startsWith('SELECT * FROM maintenance_requests'))return {rows:saved?[structuredClone(saved)]:[]};
      assert.ok(sql.startsWith('UPDATE maintenance_requests'),`Unexpected query: ${sql}`);
      beforeUpdate?.(saved);
      const sitePosition=Number(sql.match(/AND site=\$(\d+)/)?.[1]);
      assert.ok(sitePosition,'workflow mutation repeats the original assigned-site check');
      if(!eligible(saved)||saved.site!==values[sitePosition-1])return {rows:[],rowCount:0};
      mutations++;
      if(kind==='approve')Object.assign(saved,{status:'Closed',closedAt:now,closedBy:values[0],idealApprovedAt:now,idealApprovedBy:values[0]});
      else if(kind==='cancel')Object.assign(saved,{
        status:'In progress',idleReason:'',closedAt:null,closedBy:'',idealRequestedAt:null,idealRequestedBy:'',idealApprovedAt:null,idealApprovedBy:'',
        inProgressAt:saved.inProgressAt||now,inProgressBy:saved.inProgressAt?saved.inProgressBy:values[1],
      });
      else Object.assign(saved,{verificationStatus:'Verified',verifiedAt:now,verifiedBy:values[0],firstTripDone:values[1],firstTripAt:values[2],firstTripBy:values[3],firstTripCardImage:values[4],closingMeterReading:values[5]});
      return {rows:[structuredClone(saved)],rowCount:1};
    }},
    requestStakeholderLogins:async()=>{if(notificationFailure==='recipients')throw Error('Recipient lookup unavailable');return ['stupal','sanskar','damini'];},
    requestWorkflowWhatsAppLogins:async()=>{if(notificationFailure==='whatsapp-recipients')throw Error('WhatsApp lookup unavailable');return [];},
    addTicketNotifications:async(...args)=>{if(notificationFailure==='storage')throw Error('Notification storage unavailable');notifications.push(args);},
    sendRequestEventReports:async()=>{},requestNotificationTime:()=>now,requestEquipmentNotificationDetails:()=>'',
    workflowRequestLink:()=>'',publicBaseUrl:()=>'',console:{error:(...args)=>logs.push(args)},
  };
  context.pool.connect=async()=>({query:context.pool.query,release(){}});
  runInNewContext(`${auth}\n${bestEffort}\n${timelineTransaction}\n${routes[kind]}`,context);
  return {
    get saved(){return saved;},get mutations(){return mutations;},queries,logs,notifications,
    async call({session=kind==='verify'?misSession:maintenanceManager,body={}}={}){
      const req={params:{reference:pending.ref},testSession:session,body:{firstTripDone:false,firstTripCardImage:'data:image/png;base64,iVBORw==',closingMeterReading:'1234',...body}};
      const res={statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
      for(const handler of chain){
        let advanced=false,error;
        await handler(req,res,value=>{advanced=true;error=value;});
        if(error)throw error;
        if(!advanced)break;
      }
      await new Promise(resolve=>setImmediate(resolve));
      return {status:res.statusCode,body:res.body};
    },
  };
}

test('manager on-road approval closes Idle and legacy Ideal requests for MIS without losing request identity or evidence',async()=>{
  for(const status of ['Idle','Ideal']){
    const app=harness('approve',{row:{...pending,status}});
    const result=await app.call();
    assert.equal(result.status,200);
    assert.equal(result.body.status,'Closed');
    assert.equal(result.body.closedBy,maintenanceManager.name);
    assert.equal(result.body.idealApprovedBy,maintenanceManager.name);
    assert.equal(result.body.closedAt,result.body.idealApprovedAt);
    assert.equal(requestMayBeVerified(result.body),true);
    assert.equal(requestMayBeChanged(result.body),false);
    for(const key of ['ref','site','owner','requesterLogin','start','acceptedAt','acceptedBy','arrivalFlaggedAt','arrivalFlaggedBy','arrivalFlagRemark','idleReason','idealRequestedAt','idealRequestedBy','maintenanceWork','dailyRemarks'])assert.deepEqual(result.body[key],pending[key],key);
    assert.equal(app.mutations,1);
    assert.match(app.notifications[0][3],/awaiting MIS verification/);
  }
});

test('cancel or reject Idle returns to active maintenance without marking it closed or verified',async()=>{
  for(const status of ['Idle','Ideal']){
    const app=harness('cancel',{row:{...pending,status}});
    const result=await app.call();
    assert.equal(result.status,200);
    assert.equal(result.body.status,'In progress');
    assert.equal(requestMayBeChanged(result.body),true);
    assert.equal(requestMayBeVerified(result.body),false);
    assert.equal(arrivalRedFlagRequired(result.body,Date.parse(now)),false);
    for(const key of ['closedAt','idealRequestedAt','idealApprovedAt','verifiedAt'])assert.equal(result.body[key],null,key);
    for(const key of ['idleReason','closedBy','idealRequestedBy','idealApprovedBy'])assert.equal(result.body[key],'',key);
    for(const key of ['owner','requesterLogin','acceptedAt','acceptedBy','arrivalFlaggedAt','arrivalFlagRemark','dailyRemarks'])assert.deepEqual(result.body[key],pending[key],key);
  }
  const existing=harness('cancel',{row:{...pending,inProgressAt:'2026-09-08T09:10:00.000Z',inProgressBy:'Original mechanic'}});
  await existing.call();
  assert.equal(existing.saved.inProgressAt,'2026-09-08T09:10:00.000Z');
  assert.equal(existing.saved.inProgressBy,'Original mechanic');
});

test('saved manager decisions succeed even if recipient lookup or notification storage fails',async()=>{
  for(const kind of ['approve','cancel'])for(const notificationFailure of ['recipients','storage',...(kind==='approve'?['whatsapp-recipients']:[])]){
    const app=harness(kind,{notificationFailure});
    const response=await app.call();
    assert.equal(response.status,200,`${kind}/${notificationFailure}`);
    assert.equal(app.mutations,1);
    assert.equal(response.body.status,kind==='approve'?'Closed':'In progress');
    assert.ok(app.logs.length,'failed ancillary delivery is logged');
  }
});

test('duplicate manager decisions and concurrent status changes return 409 without a second mutation',async()=>{
  for(const kind of ['approve','cancel']){
    const app=harness(kind);
    assert.equal((await app.call()).status,200);
    assert.equal((await app.call()).status,409);
    assert.equal(app.mutations,1);
    for(const change of [{status:'Closed'},{status:'In progress'},{verifiedAt:now}]){
      const raced=harness(kind,{beforeUpdate:row=>Object.assign(row,change)});
      assert.equal((await raced.call()).status,409);
      assert.equal(raced.mutations,0);
      assert.equal(raced.notifications.length,0);
    }
  }
});

test('manager decisions require assigned sites and block a site change between eligibility and UPDATE',async()=>{
  for(const kind of ['approve','cancel']){
    for(const user of [{site:'Majri OB'},{}]){
      const app=harness(kind,{user});
      assert.equal((await app.call()).status,409);
      assert.equal(app.mutations,0);
      assert.equal(app.queries.filter(({sql})=>sql.startsWith('UPDATE')).length,0);
    }
    const raced=harness(kind,{beforeUpdate:row=>{row.site='Majri OB';}});
    assert.equal((await raced.call()).status,409);
    assert.equal(raced.mutations,0);
    assert.equal(raced.saved.status,'Idle');
  }
});

test('operational users cannot make manager decisions and only Maintenance Manager can cancel',async()=>{
  for(const kind of ['approve','cancel'])for(const assignedRole of ['Production User','Maintenance User','MIS User']){
    const app=harness(kind);
    assert.equal((await app.call({session:{role:'normal',assignedRole,permissions:{}}})).status,403);
    assert.equal(app.queries.length,0);
  }
  for(const managerRole of ['Production Manager','MIS Manager']){
    const app=harness('cancel');
    assert.equal((await app.call({session:{...maintenanceManager,permissions:{adminLevel:'Manager',managerRoles:[managerRole]}}})).status,403);
  }
});

test('manager-approved Idle continues to MIS verification, preserves flags/history and is idempotent',async()=>{
  const approved=harness('approve');
  const closed=(await approved.call()).body;
  const app=harness('verify',{row:closed});
  const result=await app.call();
  assert.equal(result.status,200);
  assert.equal(result.body.status,'Closed');
  assert.equal(result.body.verifiedBy,'Damini Rai');
  assert.equal(result.body.verificationStatus,'Verified');
  assert.equal(requestMayBeVerified(result.body),false);
  assert.equal(requestMayBeChanged(result.body),false);
  for(const key of ['owner','requesterLogin','closedAt','closedBy','idealApprovedAt','idealApprovedBy','arrivalFlaggedAt','arrivalFlagRemark','dailyRemarks'])assert.deepEqual(result.body[key],closed[key],key);
  assert.equal((await app.call()).status,200);
  assert.equal(app.mutations,1);
});

test('MIS cannot verify pending Idle, another site, or a request moved to another site during verification',async()=>{
  const pendingApp=harness('verify');
  assert.equal((await pendingApp.call()).status,409);
  assert.equal(pendingApp.mutations,0);
  const closed={...pending,status:'Closed',closedAt:now,closedBy:maintenanceManager.name};
  const wrongSite=harness('verify',{row:closed,user:{site:'Majri OB'}});
  assert.equal((await wrongSite.call()).status,403);
  assert.equal(wrongSite.mutations,0);
  const raced=harness('verify',{row:closed,beforeUpdate:row=>{row.site='Majri OB';}});
  assert.equal((await raced.call()).status,409);
  assert.equal(raced.mutations,0);
  assert.equal(raced.saved.verifiedAt,null);
});
