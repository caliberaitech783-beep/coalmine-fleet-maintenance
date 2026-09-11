import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyHierarchyDeliveryRule,applyUserReportScheduleOverride,defaultHierarchyReportScheduleSettings,flowDesignationForUser,GENERAL_REPORT_TITLES,normalizeUserReportSchedule,reportsAssignedToDesignation,reportsDueForDesignation,reportsForHierarchyEvent,userReportScheduleValidationError} from '../hierarchy-report-flow.mjs';
import {DIRECTOR_REPORT_TITLES} from '../director-report-bundle.mjs';
import {hierarchyAccessAllowsReport} from '../hierarchy-report-catalogue.mjs';
import {hierarchyRecipientReportScope} from '../hierarchy-report-scope.mjs';
import {reportScopeIncludesSite} from '../region-scope.mjs';
import {resolveMobileAccess} from '../mobile-access.mjs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const OPEN_BD=DIRECTOR_REPORT_TITLES[0];
const CLOSING_BD=DIRECTOR_REPORT_TITLES[1];
const at1905Ist=new Date('2026-09-11T13:35:00Z');
const personalDaily={designationKey:'misSupervisor',enabled:true,schedules:[{key:'mine',cadence:'daily',times:['19:00'],reports:[CLOSING_BD]}]};

test('a personal schedule only keeps reports the administrator assigned to the role',()=>{
  const settings=defaultHierarchyReportScheduleSettings();
  const allowed=reportsAssignedToDesignation(settings,'misSupervisor');
  assert.ok(allowed.includes(CLOSING_BD));
  assert.ok(!allowed.includes(OPEN_BD));
  const personal=normalizeUserReportSchedule({enabled:true,schedules:[{key:'mine',cadence:'daily',times:['07:30','19:00'],reports:[CLOSING_BD,OPEN_BD]}]},{designationKey:'misSupervisor',allowedReports:allowed});
  assert.deepEqual(personal.schedules[0].reports,[CLOSING_BD]);
  assert.deepEqual(personal.schedules[0].times,['07:30','19:00']);
  assert.equal(personal.designationKey,'misSupervisor');
  assert.equal(personal.enabled,true);
  assert.equal(normalizeUserReportSchedule(null),null);
  assert.equal(normalizeUserReportSchedule('junk'),null);
});

test('validation asks for a time and a report on active schedules only',()=>{
  const build=(schedule,enabled=true)=>normalizeUserReportSchedule({enabled,schedules:[schedule]},{allowedReports:[CLOSING_BD]});
  assert.match(userReportScheduleValidationError(build({cadence:'daily',times:[],reports:[CLOSING_BD]})),/IST time/);
  assert.match(userReportScheduleValidationError(build({cadence:'daily',times:['19:00'],reports:[]})),/one report/);
  assert.equal(userReportScheduleValidationError(build({cadence:'daily',times:['19:00'],reports:[CLOSING_BD]})),'');
  assert.equal(userReportScheduleValidationError(build({cadence:'event',reports:[CLOSING_BD]})),'');
  assert.equal(userReportScheduleValidationError(build({enabled:false,cadence:'daily',times:[],reports:[]})),'');
  assert.equal(userReportScheduleValidationError(build({cadence:'daily',times:[],reports:[]},false)),'');
});

test('a personal schedule replaces the role default for that user without re-adding removed slots',()=>{
  const settings=defaultHierarchyReportScheduleSettings();
  const effective=applyUserReportScheduleOverride(settings,'misSupervisor',personalDaily);
  assert.deepEqual(effective.designations.misSupervisor.schedules.map((schedule)=>schedule.key),['mine']);
  assert.deepEqual(effective.designations.director,applyUserReportScheduleOverride(settings,'misSupervisor',null).designations.director);
  assert.deepEqual(reportsDueForDesignation('misSupervisor',at1905Ist,20,effective).map((group)=>group.reports),[[CLOSING_BD]]);
  assert.deepEqual(reportsDueForDesignation('misSupervisor',at1905Ist,20,settings).flatMap((group)=>group.reports).sort(),[...GENERAL_REPORT_TITLES].sort());
  const event={type:'closed',request:{ref:'REQ/1'}};
  assert.deepEqual(reportsForHierarchyEvent('misSupervisor',event,effective),[]);
  assert.equal(reportsForHierarchyEvent('misSupervisor',event,settings).length,1);
});

test('administrator pause, a changed role and a hierarchy rule still frame a personal schedule',()=>{
  const settings=defaultHierarchyReportScheduleSettings();
  settings.designations.misSupervisor.enabled=false;
  assert.equal(applyUserReportScheduleOverride(settings,'misSupervisor',personalDaily).designations.misSupervisor.enabled,false);
  settings.designations.misSupervisor.enabled=true;
  assert.equal(applyUserReportScheduleOverride(settings,'misSupervisor',{...personalDaily,enabled:false}).designations.misSupervisor.enabled,false);
  assert.deepEqual(applyUserReportScheduleOverride(settings,'misManager',personalDaily),applyUserReportScheduleOverride(settings,'misManager',null));
  assert.deepEqual(applyUserReportScheduleOverride(settings,'unknown',personalDaily),applyUserReportScheduleOverride(settings,'unknown',null));
  const ruled=applyHierarchyDeliveryRule(settings,'misSupervisor',{scheduleDays:'Monday',scheduleTimes:'08:00',reportAccess:OPEN_BD});
  // The rule adds Opened BD and keeps the role's event slot, so both stay selectable; Idle vehicle never was.
  const effective=applyUserReportScheduleOverride(ruled,'misSupervisor',{...personalDaily,schedules:[{key:'mine',cadence:'daily',times:['19:00'],reports:[CLOSING_BD,OPEN_BD,DIRECTOR_REPORT_TITLES[6]]}]});
  assert.deepEqual(effective.designations.misSupervisor.schedules[0].reports,[CLOSING_BD,OPEN_BD]);
});

function deliveryHarness(){
  const settings=defaultHierarchyReportScheduleSettings();
  const overrides=new Map([['mis-a',personalDaily]]);
  const users=[
    {login:'mis-a',employee:'MIS A',phone:'911111111111',site:'Sasti OB',userType:'Mobile User',userGroup:'MIS User'},
    {login:'mis-b',employee:'MIS B',phone:'912222222222',site:'Sasti OB',userType:'Mobile User',userGroup:'MIS User'},
  ];
  const published=[],sent=[];
  const dependencies={
    databaseReady:true,storedWhatsAppReportSettings:async()=>({}),whatsappPurposeEnabled:()=>true,
    storedHierarchyReportScheduleSettings:async()=>settings,
    storedUserReportScheduleOverrides:async()=>overrides,
    pool:{query:async(sql)=>{
      if(sql.includes("master_name='Users & employees'"))return {rows:users.map((record_data)=>({record_data}))};
      if(sql.includes("master_name='Hierarchy master'"))return {rows:[]};
      if(sql.startsWith('INSERT INTO whatsapp_consolidated_report_runs'))return {rows:[{id:published.length+1}],rowCount:1};
      return {rows:[],rowCount:1};
    }},
    requestStakeholderLogins:async()=>users.map((user)=>user.login),
    resolveMobileAccess,flowDesignationForUser,applyHierarchyDeliveryRule,applyUserReportScheduleOverride,reportsDueForDesignation,reportsForHierarchyEvent,
    hierarchyRecipientReportScope,reportScopeIncludesSite,splitHierarchyValues:(value)=>String(value||'').split('|'),hierarchyAccessAllowsReport,
    hierarchyRuleForDesignation:()=>null,
    publishDirectorReportFiles:async(args)=>{published.push(args);return {message:'Test report'}},
    publicBaseUrl:()=>'https://example.invalid',metaWhatsAppRuntimeEnv:async()=>({}),
    hierarchyReportMessagePurpose:()=>'consolidatedRequestReport',
    sendMetaWhatsAppTemplate:async(args)=>sent.push(args),
    sendMetaWhatsAppText:async()=>{throw new Error('Unexpected fallback')},reportTemplateFallback:()=>'',
    console:{error:()=>{}},
  };
  const snippet=server.slice(server.indexOf('let hierarchyReportRunning=false;'),server.indexOf("app.post('/api/reports/director/send-test'"));
  const api=new Function(...Object.keys(dependencies),`${snippet};return {sendScheduledHierarchyReportBundles,sendRequestEventReports};`)(...Object.values(dependencies));
  return {...api,published,sent};
}

test('the sender uses each user\'s own schedule while others in the same role keep the role default',async()=>{
  const harness=deliveryHarness();
  const result=await harness.sendScheduledHierarchyReportBundles(at1905Ist);
  assert.equal(result.sent,2);
  const titlesByPhone=Object.fromEntries(harness.sent.map((message,index)=>[message.to,harness.published[index].reportTitles]));
  assert.deepEqual(titlesByPhone['911111111111'],[CLOSING_BD]);
  assert.deepEqual([...titlesByPhone['912222222222']].sort(),[...GENERAL_REPORT_TITLES].sort());
  harness.sent.length=0;harness.published.length=0;
  const event=await harness.sendRequestEventReports('closed',{ref:'REQ/9',site:'Sasti OB',requesterLogin:'mis-b',status:'Closed'});
  assert.equal(event.sent,1);
  assert.equal(harness.sent[0].to,'912222222222');
});

test('department saves go to a per-user setting and never rewrite the role default',()=>{
  const put=server.slice(server.indexOf("app.put('/api/report-schedule-settings'"),server.indexOf("app.get('/api/whatsapp-alert-history'"));
  const personal=put.slice(put.indexOf('// Every other user saves a personal copy'));
  assert.ok(personal.length>100);
  assert.doesNotMatch(personal,/HIERARCHY_REPORT_SCHEDULE_SETTING_KEY/);
  assert.match(personal,/userReportScheduleSettingKey\(scope\.login\)/);
  assert.match(personal,/body\.resetToDefault===true\|\|body\.userSchedule===null/);
  assert.match(personal,/DELETE FROM app_settings WHERE setting_key=\$1/);
  assert.match(personal,/userReportScheduleValidationError\(personal\)/);
  assert.match(server,/const USER_REPORT_SCHEDULE_SETTING_PREFIX='hierarchy_report_schedule:user:'/);
  assert.match(server,/storedUserReportScheduleOverrides\(\),\s*\]\);/);
  assert.match(server,/applyUserReportScheduleOverride\(roleScheduleSettings,designation\.key,userScheduleOverrides\.get\(login\)\|\|null\)/);
  assert.match(server,/userSchedule,\s*\.\.\.extra,/);
});

test('the schedule dialog shows the user by name and lets them pick from the role reports',()=>{
  const page=source.slice(source.indexOf('function ReportsPage('),source.indexOf('function MasterPage('));
  assert.match(page,/className="report-schedule-owner"><span>Your schedule<\/span><b>\{reportScheduleOwner\.name/);
  assert.match(page,/Customised by you/);
  assert.match(page,/<RotateCcw \/> Use role default/);
  assert.match(page,/JSON\.stringify\(\{ resetToDefault: true \}\)/);
  assert.match(page,/reportAccess\.canManageAll \? reportScheduleSettings : \{ userSchedule: userReportSchedule \}/);
  assert.match(page,/reportAccess\.allowedReports\.map\(\(title\) =>/);
  assert.match(page,/<span>User role<\/span>/);
  assert.match(page,/setUserScheduleCustomised\(Boolean\(details\.userSchedule\)\)/);
});
