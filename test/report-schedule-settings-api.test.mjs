import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import express from 'express';
import {applyHierarchyDeliveryRule,applyUserReportScheduleOverride,defaultHierarchyReportScheduleSettings,flowDesignationForUser,HIERARCHY_REPORT_DESIGNATIONS,normalizeHierarchyReportScheduleSettings,normalizeUserReportSchedule,reportsAssignedToDesignation,reportsDueForDesignation,userReportScheduleValidationError} from '../hierarchy-report-flow.mjs';
import {DIRECTOR_REPORT_TITLES} from '../director-report-bundle.mjs';
import {resolveMobileAccess} from '../mobile-access.mjs';

const serverSource=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const GLOBAL_KEY='hierarchy_report_schedules';
const personalKey=login=>`hierarchy_report_schedule:user:${login.trim().toLowerCase()}`;
const [OPEN,CLOSED]=DIRECTOR_REPORT_TITLES;
const clone=value=>structuredClone(value);
const timings=role=>role.schedules.map(({cadence,weekday,intervalDays,times})=>({cadence,weekday,intervalDays,times}));
const weekly=(weekday,times)=>({cadence:'weekly',weekday,intervalDays:null,times});
const personal=(times=['09:37'],extra={})=>({enabled:true,schedules:[{key:'mine',enabled:true,cadence:'weekly',weekday:2,times,reports:[OPEN]}],...extra});

function sourceBetween(startMarker,endMarker){
  const start=serverSource.indexOf(startMarker),end=serverSource.indexOf(endMarker,start);
  assert.ok(start>=0&&end>start,`Missing server snippet: ${startMarker}`);
  return serverSource.slice(start,end);
}

function fixtureUsers(){
  return [
    {login:'admin-a',employee:'Admin A',userType:'Super User',adminLevel:'Admin'},
    {login:'admin-b',employee:'Admin B',userType:'Super User',adminLevel:'Admin'},
    {login:'super',employee:'Super A',userType:'Super User',adminLevel:'Super Admin',designation:'Director'},
    {login:'manager',employee:'Manager A',userType:'Super User',adminLevel:'Manager',managerRole:'Production Manager'},
    {login:'production-a',employee:'Production A',userType:'Mobile User',assignedRole:'Production User',phone:'9000000001'},
    {login:'production-b',employee:'Production B',userType:'Mobile User',assignedRole:'Production User'},
    {login:'mis',employee:'MIS A',userType:'Mobile User',assignedRole:'MIS User'},
    {login:'unassigned',employee:'No Role',userType:'Mobile User'},
  ];
}

function fixtureHierarchy(){
  return [
    {designation:HIERARCHY_REPORT_DESIGNATIONS.productionSupervisor.label,scheduleDays:'Monday | Friday',scheduleTimes:'07:23 | 18:41',reportAccess:`${OPEN} | ${CLOSED}`},
    {designation:HIERARCHY_REPORT_DESIGNATIONS.misSupervisor.label,scheduleDays:'Thursday',scheduleTimes:'06:17 | 19:32',reportAccess:CLOSED},
    {designation:HIERARCHY_REPORT_DESIGNATIONS.admin.label,scheduleDays:'Tuesday | Wednesday',scheduleTimes:'08:13 | 20:27',reportAccess:`${OPEN} | ${CLOSED}`},
    {designation:HIERARCHY_REPORT_DESIGNATIONS.superAdmin.label,scheduleDays:'Saturday',scheduleTimes:'11:41',reportAccess:`${OPEN} | ${CLOSED}`},
  ];
}

async function harness(t,{settings=defaultHierarchyReportScheduleSettings(),overrides={}}={}){
  const users=fixtureUsers(),hierarchy=fixtureHierarchy(),rows=new Map(),writes=[],queries=[];
  const putRow=(key,value)=>rows.set(key,{setting_value:clone(value),updated_at:'2026-09-15T02:00:00.000Z'});
  if(settings!==null)putRow(GLOBAL_KEY,settings);
  for(const [login,value] of Object.entries(overrides))putRow(personalKey(login),value);
  const saved=key=>clone(rows.get(key)?.setting_value);
  const pool={query:async(sql,args=[])=>{
    queries.push({sql,args:clone(args)});
    if(sql.includes("master_name='Hierarchy master'"))return {rows:hierarchy.map(record_data=>({record_data:clone(record_data)}))};
    if(sql.includes("master_name='Users & employees'"))return {rows:users.map(record_data=>({record_data:clone(record_data)}))};
    if(sql.startsWith('SELECT setting_value')&&sql.includes('FROM app_settings'))return {rows:rows.has(args[0])?[clone(rows.get(args[0]))]:[]};
    if(sql.startsWith('INSERT INTO app_settings')){
      const value=JSON.parse(args[1]);putRow(args[0],value);writes.push({operation:'save',key:args[0],value:clone(value)});
      return {rows:[],rowCount:1};
    }
    if(sql.startsWith('DELETE FROM app_settings')){
      rows.delete(args[0]);writes.push({operation:'delete',key:args[0]});return {rows:[],rowCount:1};
    }
    assert.fail(`Unexpected SQL: ${sql}`);
  }};
  const app=express();app.use(express.json());
  const requireSession=(req,res,next)=>{
    const login=String(req.get('Authorization')||'').replace(/^Bearer /,'').trim().toLowerCase();
    const user=users.find(user=>user.login===login);
    if(!user)return res.status(401).json({error:'Sign in required'});
    const profile=resolveMobileAccess({user});
    req.session={login,name:user.employee,role:profile.sessionRole,assignedRole:profile.assignedRole,permissions:profile.permissions};
    next();
  };
  const bindings={app,pool,requireSession,HIERARCHY_REPORT_SCHEDULE_SETTING_KEY:GLOBAL_KEY,
    currentUserRecord:async session=>clone(users.find(user=>user.login===session.login)||{}),
    applyHierarchyDeliveryRule,applyUserReportScheduleOverride,defaultHierarchyReportScheduleSettings,flowDesignationForUser,
    HIERARCHY_REPORT_DESIGNATIONS,normalizeHierarchyReportScheduleSettings,normalizeUserReportSchedule,reportsAssignedToDesignation,
    userReportScheduleValidationError,DIRECTOR_REPORT_TITLES,resolveMobileAccess,
  };
  // Register the real GET/PUT routes and use their actual scope, hierarchy lookup
  // and app_settings helpers. Authentication and database I/O are local fixtures.
  const snippet=[
    sourceBetween('async function storedHierarchyReportScheduleSettings(','async function storedWhatsAppReportSettings('),
    sourceBetween('function canManageAllReportSchedules(','async function readWhatsAppReportSettingsDetails('),
    sourceBetween('function hierarchyRuleForDesignation(','async function publishDirectorReportFiles('),
    sourceBetween('async function reportScheduleScope(',"app.get('/api/whatsapp-alert-history'"),
  ].join('\n');
  new Function(...Object.keys(bindings),snippet)(...Object.values(bindings));
  app.use((error,_req,res,_next)=>res.status(500).json({error:error.message}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const request=async(login,{method='GET',scope='',body}={})=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/report-schedule-settings${scope?`?scope=${scope}`:''}`,{
      method,headers:{Authorization:login?`Bearer ${login}`:'','Content-Type':'application/json'},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
    });
    return {status:response.status,body:await response.json()};
  };
  const get=async(login,scope='')=>{const result=await request(login,{scope});assert.equal(result.status,200,JSON.stringify(result.body));return result.body;};
  const put=async(login,body,scope='')=>{const result=await request(login,{method:'PUT',scope,body});assert.equal(result.status,200,JSON.stringify(result.body));return result.body;};
  return {request,get,put,saved,putRow,writes,queries,users,hierarchy};
}

test('schedule routes require a session and reject profiles without a report designation',async t=>{
  const api=await harness(t);
  for(const method of ['GET','PUT']){
    assert.equal((await api.request('',{method})).status,401);
    assert.equal((await api.request('unassigned',{method,body:method==='PUT'?{userSchedule:personal()}:undefined})).status,403);
  }
  assert.deepEqual(api.writes,[]);
});

test('global GET shows effective hierarchy weekdays and minute slots without rewriting saved defaults',async t=>{
  const api=await harness(t),before=api.saved(GLOBAL_KEY),hierarchyBefore=clone(api.hierarchy);
  for(const login of ['admin-a','super']){
    const response=await api.get(login);
    assert.equal(response.canManageAll,true);
    assert.deepEqual(response.allowedDesignationKeys,Object.keys(HIERARCHY_REPORT_DESIGNATIONS));
    assert.deepEqual(response.allowedReports,DIRECTOR_REPORT_TITLES);
    assert.equal(response.userSchedule,null);
    assert.deepEqual(timings(response.settings.designations.productionSupervisor),[weekly(1,['07:23','18:41']),weekly(5,['07:23','18:41'])]);
    assert.deepEqual(timings(response.settings.designations.misSupervisor),[weekly(4,['06:17','19:32'])]);
    assert.deepEqual(timings(response.settings.designations.admin),[weekly(2,['08:13','20:27']),weekly(3,['08:13','20:27'])]);
    assert.equal(response.settings.designations.productionSupervisor.managedByReportSettings,false);
    assert.deepEqual(response.recipients.productionSupervisor,[
      {login:'production-a',name:'Production A',hasPhone:true},{login:'production-b',name:'Production B',hasPhone:false},
    ]);
  }
  assert.deepEqual(api.saved(GLOBAL_KEY),before);
  assert.deepEqual(api.hierarchy,hierarchyBefore);
  assert.deepEqual(api.writes,[]);
});

test('global GET also applies legacy hierarchy times when no shared settings row exists',async t=>{
  const api=await harness(t,{settings:null}),response=await api.get('admin-a');
  assert.deepEqual(timings(response.settings.designations.misSupervisor),[weekly(4,['06:17','19:32'])]);
  assert.equal(api.saved(GLOBAL_KEY),undefined);
  assert.deepEqual(api.writes,[]);
});

for(const [login,designationKey] of [['admin-a','admin'],['super','superAdmin']]){
  test(`${login}: personal GET/PUT saves only this administrator's schedule`,async t=>{
    const api=await harness(t),before=api.saved(GLOBAL_KEY);
    const initial=await api.get(login,'personal');
    assert.equal(initial.canManageAll,false);
    assert.deepEqual(initial.allowedDesignationKeys,[designationKey]);
    assert.deepEqual(Object.keys(initial.settings.designations),[designationKey]);
    assert.deepEqual(initial.allowedReports,[OPEN,CLOSED]);
    assert.equal(initial.userLogin,login);
    assert.equal(initial.userSchedule,null);
    const response=await api.put(login,{
      userLogin:'admin-b',userSchedule:personal(['07:19','20:43'],{designationKey:'director'}),
      designations:{productionSupervisor:{enabled:false,schedules:[]}},
    },'personal');
    assert.equal(response.canManageAll,false);
    assert.equal(response.userSchedule.designationKey,designationKey);
    assert.deepEqual(response.userSchedule.schedules[0].times,['07:19','20:43']);
    assert.deepEqual(api.writes.map(({key})=>key),[personalKey(login)]);
    assert.deepEqual(api.saved(GLOBAL_KEY),before);
    assert.equal(api.saved(personalKey('admin-b')),undefined);
    assert.equal((await api.get('admin-b','personal')).userSchedule,null);
    assert.equal((await api.get(login)).userSchedule,null);
    assert.deepEqual((await api.get(login,'personal')).userSchedule,response.userSchedule);
  });
}

test('one user can customise days and times without changing another user or the effective shared defaults',async t=>{
  const api=await harness(t),before=api.saved(GLOBAL_KEY);
  const response=await api.put('production-a',{userSchedule:personal()},'personal');
  const other=await api.get('production-b');
  assert.deepEqual(response.allowedDesignationKeys,['productionSupervisor']);
  assert.equal(other.canManageAll,false);
  assert.equal(other.userSchedule,null);
  assert.deepEqual(timings(other.settings.designations.productionSupervisor),[weekly(1,['07:23','18:41']),weekly(5,['07:23','18:41'])]);
  const now=new Date('2026-09-15T09:37:00+05:30');
  const effective=applyUserReportScheduleOverride(response.settings,'productionSupervisor',response.userSchedule);
  assert.deepEqual(reportsDueForDesignation('productionSupervisor',now,20,effective).map(({reports})=>reports),[[OPEN]]);
  assert.deepEqual(reportsDueForDesignation('productionSupervisor',now,20,other.settings),[]);
  await api.put('production-b',{userSchedule:personal(['13:47'])});
  assert.deepEqual((await api.get('production-a')).userSchedule.schedules[0].times,['09:37']);
  assert.deepEqual((await api.get('production-b')).userSchedule.schedules[0].times,['13:47']);
  assert.deepEqual(api.saved(GLOBAL_KEY),before);
  assert.deepEqual(api.writes.map(({key})=>key),[personalKey('production-a'),personalKey('production-b')]);
});

test('resetting an admin personal schedule deletes only its own row and restores the effective role times',async t=>{
  const api=await harness(t,{overrides:{'admin-a':personal(['07:31'],{designationKey:'admin'}),'admin-b':personal(['22:13'],{designationKey:'admin'})}});
  const globalBefore=api.saved(GLOBAL_KEY),otherBefore=api.saved(personalKey('admin-b'));
  for(const reset of [{resetToDefault:true},{userSchedule:null}]){
    api.putRow(personalKey('admin-a'),personal(['07:31'],{designationKey:'admin'}));
    const response=await api.put('admin-a',reset,'personal');
    assert.equal(response.userSchedule,null);
    assert.deepEqual(timings(response.settings.designations.admin),[weekly(2,['08:13','20:27']),weekly(3,['08:13','20:27'])]);
    assert.equal(api.saved(personalKey('admin-a')),undefined);
    assert.deepEqual(api.saved(personalKey('admin-b')),otherBefore);
    assert.deepEqual(api.saved(GLOBAL_KEY),globalBefore);
  }
  assert.ok(api.writes.every(({operation,key})=>operation==='delete'&&key===personalKey('admin-a')));
});

test('legacy hierarchy defaults remain live until central save; a partial central save preserves other role timings and personal overrides',async t=>{
  const api=await harness(t,{overrides:{'production-a':personal(['21:47'],{designationKey:'productionSupervisor'})}});
  const personalBefore=api.saved(personalKey('production-a'));
  api.hierarchy[0].scheduleTimes='08:29 | 20:11';
  const initial=await api.get('admin-a');
  assert.deepEqual(timings(initial.settings.designations.productionSupervisor),[weekly(1,['08:29','20:11']),weekly(5,['08:29','20:11'])]);
  assert.deepEqual(api.writes,[]);
  const changed={...initial.settings.designations.productionSupervisor,schedules:[
    {key:'central',enabled:true,cadence:'weekly',weekday:0,times:['10:33','20:07'],reports:[OPEN,CLOSED]},
  ]};
  const saved=await api.put('admin-a',{designations:{productionSupervisor:changed}});
  assert.equal(saved.settings.designations.productionSupervisor.managedByReportSettings,true);
  assert.deepEqual(timings(saved.settings.designations.productionSupervisor),[weekly(0,['10:33','20:07'])]);
  assert.deepEqual(saved.settings.designations.misSupervisor,initial.settings.designations.misSupervisor);
  assert.equal(api.saved(GLOBAL_KEY).designations.misSupervisor.managedByReportSettings,false);
  assert.deepEqual(api.saved(personalKey('production-a')),personalBefore);
  assert.deepEqual(api.writes.map(({key})=>key),[GLOBAL_KEY]);
  api.hierarchy[0].scheduleTimes='01:01';api.hierarchy[1].scheduleTimes='05:39';
  const after=await api.get('admin-a');
  assert.deepEqual(timings(after.settings.designations.productionSupervisor),[weekly(0,['10:33','20:07'])]);
  assert.deepEqual(timings(after.settings.designations.misSupervisor),[weekly(4,['05:39'])]);
  const user=await api.get('production-a');
  assert.deepEqual(timings(user.settings.designations.productionSupervisor),[weekly(0,['10:33','20:07'])]);
  assert.deepEqual(user.userSchedule.schedules[0].times,['21:47']);
});

test('saving the complete global response retains all its effective days and times as central defaults',async t=>{
  const api=await harness(t),initial=await api.get('super');
  const saved=await api.put('super',initial.settings);
  for(const key of Object.keys(initial.settings.designations)){
    assert.deepEqual(timings(saved.settings.designations[key]),timings(initial.settings.designations[key]),key);
    assert.equal(saved.settings.designations[key].managedByReportSettings,true,key);
  }
  for(const rule of api.hierarchy){rule.scheduleDays='Sunday';rule.scheduleTimes='00:09';}
  assert.deepEqual((await api.get('super')).settings,saved.settings);
  assert.deepEqual(api.writes.map(({key})=>key),[GLOBAL_KEY]);
});

test('personal GET and PUT migrate event-only selections using effective role weekday and minute slots',async t=>{
  const legacy={designationKey:'misSupervisor',enabled:true,schedules:[{key:'old-event',cadence:'event',reports:[CLOSED,OPEN]}]};
  const api=await harness(t,{overrides:{mis:legacy}}),globalBefore=api.saved(GLOBAL_KEY);
  const read=await api.get('mis');
  assert.deepEqual(read.allowedReports,[CLOSED]);
  assert.deepEqual(timings(read.userSchedule),[weekly(4,['06:17','19:32'])]);
  assert.deepEqual(read.userSchedule.schedules[0].reports,[CLOSED]);
  assert.deepEqual(api.saved(personalKey('mis')),legacy);
  assert.deepEqual(api.writes,[]);
  const saved=await api.put('mis',{userSchedule:legacy});
  assert.deepEqual(timings(saved.userSchedule),[weekly(4,['06:17','19:32'])]);
  assert.deepEqual(saved.userSchedule.schedules[0].reports,[CLOSED]);
  assert.deepEqual((await api.get('mis')).userSchedule,saved.userSchedule);
  assert.deepEqual(api.saved(GLOBAL_KEY),globalBefore);
  assert.deepEqual(api.writes.map(({key})=>key),[personalKey('mis')]);
});

test('central event-only personal migration follows centrally saved timings, overriding older hierarchy defaults',async t=>{
  const settings=defaultHierarchyReportScheduleSettings();
  settings.designations.misSupervisor={...settings.designations.misSupervisor,managedByReportSettings:true,schedules:[
    {key:'central-cycle',enabled:true,cadence:'interval',intervalDays:5,times:['10:21','23:43'],reports:[CLOSED]},
  ]};
  const api=await harness(t,{settings});
  const response=await api.put('mis',{userSchedule:{schedules:[{cadence:'event',reports:[CLOSED]}]}});
  assert.deepEqual(timings(response.userSchedule),[{cadence:'interval',weekday:null,intervalDays:5,times:['10:21','23:43']}]);
  assert.deepEqual((await api.get('mis')).userSchedule,response.userSchedule);
});

test('personal edits cannot lift a shared role pause',async t=>{
  const settings=defaultHierarchyReportScheduleSettings();settings.designations.productionSupervisor.enabled=false;
  const api=await harness(t,{settings});
  const response=await api.put('production-a',{userSchedule:personal()});
  assert.equal(response.userSchedule.enabled,true);
  assert.equal(response.settings.designations.productionSupervisor.enabled,false);
  const effective=applyUserReportScheduleOverride(response.settings,'productionSupervisor',response.userSchedule);
  assert.deepEqual(reportsDueForDesignation('productionSupervisor',new Date('2026-09-15T09:37:00+05:30'),20,effective),[]);
  assert.equal(api.saved(GLOBAL_KEY).designations.productionSupervisor.enabled,false);
});

test('a manager cannot use a global scope or forged designation to write central or other-user schedules',async t=>{
  const api=await harness(t),before=api.saved(GLOBAL_KEY);
  const response=await api.get('manager','global');
  assert.equal(response.canManageAll,false);
  assert.deepEqual(response.allowedDesignationKeys,['productionManager']);
  const rejected=await api.request('manager',{method:'PUT',scope:'global',body:{designations:{admin:{enabled:false,schedules:[]}}}});
  assert.equal(rejected.status,400);
  assert.deepEqual(api.writes,[]);
  const saved=await api.put('manager',{userLogin:'admin-a',userSchedule:personal(['07:11'],{designationKey:'admin'})},'global');
  assert.equal(saved.userSchedule.designationKey,'productionManager');
  assert.deepEqual(api.writes.map(({key})=>key),[personalKey('manager')]);
  assert.equal(api.saved(personalKey('admin-a')),undefined);
  assert.deepEqual(api.saved(GLOBAL_KEY),before);
});

test('personal PUT rejects active schedules without valid times or permitted reports before writing',async t=>{
  const api=await harness(t),before=api.saved(GLOBAL_KEY);
  for(const userSchedule of [
    personal(['25:00']),personal([]),personal(['09:37'],{schedules:[{cadence:'daily',times:['09:37'],reports:['Unknown report']}]}),
    {schedules:[{cadence:'daily',times:['09:37'],reports:[OPEN]}]},
  ]){
    const response=await api.request('mis',{method:'PUT',body:{userSchedule}});
    assert.equal(response.status,400,JSON.stringify(response.body));
  }
  assert.deepEqual(api.writes,[]);
  assert.deepEqual(api.saved(GLOBAL_KEY),before);
});
