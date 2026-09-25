import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyHierarchyDeliveryRule,applyUserReportScheduleOverride,defaultHierarchyReportScheduleSettings,flowDesignationForUser,GENERAL_REPORT_TITLES,normalizeHierarchyReportScheduleSettings,normalizeUserReportSchedule,reportsAssignedToDesignation,reportsDueForDesignation,reportsForHierarchyEvent,userReportScheduleValidationError} from '../hierarchy-report-flow.mjs';
import {DIRECTOR_REPORT_TITLES} from '../director-report-bundle.mjs';
import {hierarchyAccessAllowsReport} from '../hierarchy-report-catalogue.mjs';
import {hierarchyRecipientReportScope} from '../hierarchy-report-scope.mjs';
import {displaySiteName} from '../region-scope.mjs';
import {reportSites,siteSourceData} from '../site-consolidated-report.mjs';
import {resolveMobileAccess} from '../mobile-access.mjs';
import {siteReportMessageContext,recipientReportMessage} from '../whatsapp-message-format.mjs';

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
  assert.deepEqual(reportsDueForDesignation('misSupervisor',at1905Ist,20,settings).flatMap((group)=>group.reports).sort(),[CLOSING_BD,DIRECTOR_REPORT_TITLES[2],...GENERAL_REPORT_TITLES].sort());
  const event={type:'closed',request:{ref:'REQ/1'}};
  assert.deepEqual(reportsForHierarchyEvent('misSupervisor',event,effective),[]);
  assert.deepEqual(reportsForHierarchyEvent('misSupervisor',event,settings),[]);
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
  // The rule's selected reports are final; legacy event choices cannot widen them.
  const effective=applyUserReportScheduleOverride(ruled,'misSupervisor',{...personalDaily,schedules:[{key:'mine',cadence:'daily',times:['19:00'],reports:[CLOSING_BD,OPEN_BD,DIRECTOR_REPORT_TITLES[6]]}]});
  assert.deepEqual(effective.designations.misSupervisor.schedules[0].reports,[OPEN_BD]);
});

test('personal legacy migration preserves minute slots, weekdays, intervals and selected permissions',()=>{
  const role=defaultHierarchyReportScheduleSettings();
  const personal={designationKey:'productionManager',enabled:true,updatedAt:'2026-09-01T00:00:00Z',schedules:[
    {key:'event',cadence:'event',reports:[OPEN_BD,CLOSING_BD,DIRECTOR_REPORT_TITLES[2],'Unknown report']},
    {key:'my-mornings',cadence:'weekly',weekday:2,times:['07:17','19:43'],reports:[DIRECTOR_REPORT_TITLES[3]]},
    {key:'my-cycle',cadence:'interval',intervalDays:5,times:['08:02'],reports:[DIRECTOR_REPORT_TITLES[8]]},
  ]};
  const original=structuredClone(personal);
  const effective=applyUserReportScheduleOverride(role,'productionManager',personal);
  assert.deepEqual(personal,original);
  assert.deepEqual(effective.designations.productionManager.schedules.map(({key,cadence,weekday,intervalDays,times})=>({key,cadence,weekday,intervalDays,times})),[
    {key:'my-mornings',cadence:'weekly',weekday:2,intervalDays:null,times:['07:17','19:43']},
    {key:'my-cycle',cadence:'interval',weekday:null,intervalDays:5,times:['08:02']},
  ]);
  assert.deepEqual(effective.designations.productionManager.schedules[0].reports,[DIRECTOR_REPORT_TITLES[3],OPEN_BD,CLOSING_BD,DIRECTOR_REPORT_TITLES[2]]);
  assert.deepEqual(reportsAssignedToDesignation(effective,'productionManager').sort(),[OPEN_BD,CLOSING_BD,DIRECTOR_REPORT_TITLES[2],DIRECTOR_REPORT_TITLES[3],DIRECTOR_REPORT_TITLES[8]].sort());
  assert.deepEqual(normalizeHierarchyReportScheduleSettings(effective),effective);
  assert.equal(normalizeUserReportSchedule(personal,{allowedReports:DIRECTOR_REPORT_TITLES}).updatedAt,personal.updatedAt);
});

test('event-only personal schedules use actual configured role timing or 7 PM when no role exists',()=>{
  const settings=defaultHierarchyReportScheduleSettings();
  settings.designations.misSupervisor.schedules=[{key:'custom-role',cadence:'weekly',weekday:5,times:['07:21','19:32'],reports:[CLOSING_BD]}];
  const personal={designationKey:'misSupervisor',schedules:[{key:'old-event',cadence:'event',reports:[CLOSING_BD,OPEN_BD]}]};
  const effective=applyUserReportScheduleOverride(settings,'misSupervisor',personal);
  assert.deepEqual(effective.designations.misSupervisor.schedules,[{
    key:'custom-role',enabled:true,cadence:'weekly',weekday:5,intervalDays:null,times:['07:21','19:32'],reports:[CLOSING_BD],
  }]);
  const fallback=normalizeUserReportSchedule({schedules:[{cadence:'event',reports:[CLOSING_BD]}]},{allowedReports:[CLOSING_BD]});
  assert.deepEqual(fallback.schedules[0].times,['19:00']);
  assert.equal(fallback.schedules[0].cadence,'daily');
});

test('legacy personal event selections keep an existing general slot and never restore removed reports',()=>{
  const settings=defaultHierarchyReportScheduleSettings();
  const personal={designationKey:'misSupervisor',schedules:[
    {key:'every-event',cadence:'event',reports:[CLOSING_BD,OPEN_BD]},
    {key:'general-daily-19',cadence:'daily',times:['19:19'],reports:[GENERAL_REPORT_TITLES[0]]},
  ]};
  const effective=applyUserReportScheduleOverride(settings,'misSupervisor',personal);
  assert.deepEqual(effective.designations.misSupervisor.schedules,[{
    key:'general-daily-19',enabled:true,cadence:'daily',weekday:null,intervalDays:null,times:['19:19'],reports:[GENERAL_REPORT_TITLES[0],CLOSING_BD],
  }]);
  assert.deepEqual(reportsDueForDesignation('misSupervisor',at1905Ist,20,effective),[]);
  const due=reportsDueForDesignation('misSupervisor',new Date('2026-09-11T13:50:00Z'),20,effective);
  assert.equal(due.length,1);
  assert.deepEqual(due[0].reports,[GENERAL_REPORT_TITLES[0],CLOSING_BD]);
  assert.equal(due[0].window.end.toISOString(),'2026-09-11T13:49:00.000Z');
});

test('disabled personal choices remain paused through legacy migration and repeated normalization',()=>{
  const settings=defaultHierarchyReportScheduleSettings();
  const event={key:'old',cadence:'event',reports:[CLOSING_BD]};
  for(const personal of [
    {enabled:false,schedules:[event]},
    {schedules:[]},
    {schedules:[{...event,enabled:false}]},
    {schedules:[event,{key:'paused',enabled:false,cadence:'daily',times:['19:00'],reports:[CLOSING_BD]}]},
    {schedules:[{...event,reports:[]}]},
  ]){
    const effective=applyUserReportScheduleOverride(settings,'misSupervisor',personal);
    assert.deepEqual(reportsDueForDesignation('misSupervisor',at1905Ist,20,effective),[]);
    assert.deepEqual(normalizeHierarchyReportScheduleSettings(effective),effective);
  }
  settings.designations.misSupervisor.schedules[0].enabled=false;
  const paused=applyUserReportScheduleOverride(settings,'misSupervisor',{schedules:[event]});
  assert.deepEqual(paused.designations.misSupervisor.schedules.map(({enabled,reports})=>({enabled,reports})),[{enabled:false,reports:[CLOSING_BD]}]);
});

test('legacy hierarchy defaults cannot reactivate paused schedules or their report selections',()=>{
  const rule={scheduleDays:'Monday',scheduleTimes:'19:00',reportAccess:`${OPEN_BD} | ${CLOSING_BD}`};
  for(const schedules of [[],[{key:'paused',enabled:false,cadence:'daily',times:['19:00'],reports:[CLOSING_BD]}]]){
    const settings={designations:{director:{schedules}}};
    assert.deepEqual(applyHierarchyDeliveryRule(settings,'director',rule),normalizeHierarchyReportScheduleSettings(settings));
  }
  const settings={designations:{director:{schedules:[
    {key:'paused',enabled:false,cadence:'daily',times:['19:00'],reports:[CLOSING_BD]},
    {key:'active',enabled:true,cadence:'daily',times:['19:00'],reports:[OPEN_BD]},
  ]}}};
  const ruled=applyHierarchyDeliveryRule(settings,'director',rule);
  assert.deepEqual(reportsDueForDesignation('director',new Date('2026-09-07T13:35:00Z'),20,ruled).map(({reports})=>reports),[[OPEN_BD]]);
  assert.deepEqual(applyHierarchyDeliveryRule(ruled,'director',rule),ruled);
});

test('daily personal UI payload ignores stale interval and weekday controls',()=>{
  const personal=normalizeUserReportSchedule({schedules:[{key:'mine',cadence:'daily',weekday:1,intervalDays:7,times:['07:30'],reports:[CLOSING_BD]}]},{allowedReports:[CLOSING_BD]});
  assert.equal(personal.schedules[0].cadence,'daily');
  assert.equal(personal.schedules[0].weekday,null);
  assert.equal(personal.schedules[0].intervalDays,null);
});

const recipientLoginSource=server.slice(server.indexOf('function reportRecipientLogin('),server.indexOf('function userReportScheduleSettingKey('));
const reportRecipientLogin=new Function(`${recipientLoginSource};return reportRecipientLogin;`)();
const schedulerSource=server.slice(server.indexOf('function combineReportWindowGroups('),server.indexOf("app.post('/api/reports/director/send-test'"));
assert.ok(schedulerSource.includes('async function sendScheduledHierarchyReportBundles('),'extract the scheduler together with its window grouping helper');

function deliveryHarness({
  settings=defaultHierarchyReportScheduleSettings(),
  overrides=new Map([['mis-a',structuredClone(personalDaily)]]),
  users=[
    {login:'mis-a',employee:'MIS A',phone:'911111111111',site:'Sasti OB',userType:'Mobile User',userGroup:'MIS User'},
    {login:'mis-b',employee:'MIS B',phone:'912222222222',site:'Sasti OB',userType:'Mobile User',userGroup:'MIS User'},
  ],
  rule=null,deliveryEnabled=true,fail=false,
}={}){
  const sourceData={
    requests:[{ref:'S',site:'Sasti OB',start:'2026-09-11T13:00:00Z'},{ref:'M',site:'Majri OB',start:'2026-09-11T13:00:00Z'}],
    equipmentRecords:[{id:'S',currentLocation:'Sasti OB'},{id:'M',currentLocation:'Majri OB'}],
    transferRecords:[{id:'S',destination:'Sasti OB'},{id:'M',destination:'Majri OB'}],
  };
  const published=[],sent=[],history=[],errors=[],claims=new Map();
  const activity={sourceReads:0};
  const dependencies={
    databaseReady:true,storedWhatsAppReportSettings:async()=>({}),whatsappPurposeEnabled:()=>deliveryEnabled,
    storedHierarchyReportScheduleSettings:async()=>settings,
    storedUserReportScheduleOverrides:async()=>overrides,
    pool:{query:async(sql,args=[])=>{
      if(sql.includes("master_name='Users & employees'"))return {rows:users.map((record_data)=>({record_data}))};
      if(sql.includes("master_name='Hierarchy master'"))return {rows:[]};
      if(sql.startsWith('INSERT INTO whatsapp_consolidated_report_runs')){
        const key=JSON.stringify(args),previous=claims.get(key);
        if(previous&&(!previous.status.startsWith('Failed')||previous.attempts>=3))return {rows:[],rowCount:0};
        const claim={id:previous?.id||claims.size+1,args,status:'Sending',attempts:(previous?.attempts||0)+1};
        claims.set(key,claim);return {rows:[{id:claim.id}],rowCount:1};
      }
      if(sql.startsWith('UPDATE whatsapp_consolidated_report_runs')){
        const claim=[...claims.values()].find(({id})=>id===args[1]);
        assert.ok(claim,'only update a claim made by this scheduler run');
        claim.status=args[0];return {rows:[],rowCount:1};
      }
      if(sql.includes('INSERT INTO whatsapp_alert_history')){history.push(args);return {rows:[],rowCount:1};}
      throw new Error(`Unexpected scheduler query: ${sql}`);
    }},
    resolveMobileAccess,flowDesignationForUser,applyHierarchyDeliveryRule,applyUserReportScheduleOverride,reportsDueForDesignation,
    reportRecipientLogin,hierarchyRecipientReportScope,hierarchyAccessAllowsReport,reportSites,displaySiteName,
    hierarchyRuleForDesignation:()=>rule,recipientReportMessage,
    directorReportSourceData:async()=>{activity.sourceReads++;return sourceData;},
    publishDirectorReportFiles:async(args)=>{
      const reportContext=siteReportMessageContext({site:args.siteAccess,window:args.window,count:1,pdfUrl:`https://example.invalid/${published.length+1}.pdf`,xlsxUrl:`https://example.invalid/${published.length+1}.xlsx`});
      const {message}=recipientReportMessage({window:args.window,reports:[reportContext]});
      published.push({args,data:structuredClone(siteSourceData(args.sourceData,args.siteAccess)),message});
      return {message,reportContext};
    },
    publicBaseUrl:()=>'https://example.invalid',metaWhatsAppRuntimeEnv:async()=>({}),
    sendMetaWhatsAppTemplate:async(args)=>{if(fail)throw new Error('Template unavailable');sent.push(args);},mirrorToTelegramUsers:()=>{},
    console:{error:(...args)=>errors.push(args)},
  };
  const api=new Function(...Object.keys(dependencies),`${schedulerSource};return {sendScheduledHierarchyReportBundles,sendRequestEventReports};`)(...Object.values(dependencies));
  return {...api,settings,overrides,sourceData,activity,published,sent,history,errors,claims};
}

test('the sender uses each user\'s own schedule while others in the same role keep the role default',async()=>{
  const harness=deliveryHarness();
  const result=await harness.sendScheduledHierarchyReportBundles(at1905Ist);
  assert.deepEqual(result,{sent:2,failed:0,skipped:0});
  const titlesByPhone=Object.fromEntries(harness.sent.map((message)=>[message.to,harness.published.find((bundle)=>bundle.message===message.parameters[0]).args.reportTitles]));
  assert.deepEqual(titlesByPhone['911111111111'],[CLOSING_BD]);
  assert.deepEqual([...titlesByPhone['912222222222']].sort(),[CLOSING_BD,DIRECTOR_REPORT_TITLES[2],...GENERAL_REPORT_TITLES].sort());
  assert.equal(harness.activity.sourceReads,1);
  for(const {args,data} of harness.published){
    assert.equal(args.siteAccess,'sasti ob');
    assert.equal(args.sourceData,harness.sourceData);
    assert.deepEqual(args.window,{start:new Date('2026-09-10T13:30:00Z'),end:new Date('2026-09-11T13:30:00Z')});
    assert.deepEqual(data.requests.map(({ref})=>ref),['S']);
    assert.deepEqual(data.equipmentRecords.map(({id})=>id),['S']);
    assert.deepEqual(data.transferRecords.map(({id})=>id),['S']);
  }
  assert.equal(harness.sourceData.requests.length,2);
  assert.deepEqual(harness.errors,[]);
  const event=await harness.sendRequestEventReports('closed',{ref:'REQ/9',site:'Sasti OB',requesterLogin:'mis-b',status:'Closed'});
  assert.equal(event.skipped,true);
  assert.equal(harness.sent.length,2);
  assert.equal(harness.published.length,2);
  assert.equal(harness.activity.sourceReads,1);
});

test('the sender honors personal minute slots and their overnight windows instead of the role timing',async()=>{
  const personal={...personalDaily,schedules:[{key:'mine',cadence:'daily',times:['07:17','19:43'],reports:[CLOSING_BD]}]};
  const harness=deliveryHarness({overrides:new Map([['mis-a',personal]])});
  const morning=await harness.sendScheduledHierarchyReportBundles(new Date('2026-09-11T01:50:00Z'));
  assert.deepEqual(morning,{sent:1,failed:0,skipped:0});
  assert.equal(harness.sent[0].to,'911111111111');
  assert.deepEqual(harness.published[0].args.window,{start:new Date('2026-09-10T14:13:00Z'),end:new Date('2026-09-11T01:47:00Z')});
  const evening=await harness.sendScheduledHierarchyReportBundles(at1905Ist);
  assert.deepEqual(evening,{sent:1,failed:0,skipped:0});
  assert.equal(harness.sent[1].to,'912222222222');
  assert.equal(harness.published[1].args.window.end.toISOString(),'2026-09-11T13:30:00.000Z');
  assert.deepEqual(harness.errors,[]);
});

test('scheduled delivery respects personal, role, schedule and global pauses before loading report data',async()=>{
  for(const personal of [{...personalDaily,enabled:false},{...personalDaily,schedules:[]},{...personalDaily,schedules:[{...personalDaily.schedules[0],enabled:false}]}]){
    const harness=deliveryHarness({overrides:new Map([['mis-a',personal]])});
    assert.deepEqual(await harness.sendScheduledHierarchyReportBundles(at1905Ist),{sent:1,failed:0,skipped:0});
    assert.deepEqual(harness.sent.map(({to})=>to),['912222222222']);
    assert.ok([...harness.claims.values()].every(({args})=>args[1]==='mis-b'));
    assert.deepEqual(harness.errors,[]);
  }
  for(const pause of ['role','schedules','global']){
    const harness=deliveryHarness({overrides:new Map(),deliveryEnabled:pause!=='global'});
    if(pause==='role')harness.settings.designations.misSupervisor.enabled=false;
    if(pause==='schedules')harness.settings.designations.misSupervisor.schedules.forEach((schedule)=>{schedule.enabled=false;});
    const result=await harness.sendScheduledHierarchyReportBundles(at1905Ist);
    assert.equal(result.sent||0,0,pause);
    assert.equal(harness.claims.size,0,pause);
    assert.equal(harness.published.length,0,pause);
    assert.equal(harness.activity.sourceReads,0,pause);
    assert.deepEqual(harness.errors,[]);
  }
  const pausedRole=deliveryHarness();
  pausedRole.settings.designations.misSupervisor.enabled=false;
  assert.deepEqual(await pausedRole.sendScheduledHierarchyReportBundles(at1905Ist),{sent:0,failed:0,skipped:0});
  assert.equal(pausedRole.claims.size,0,'an active personal override cannot unpause its role');
});

test('the sender combines coincident daily and weekly personal groups, reuses site bundles and deduplicates polls',async()=>{
  const personal={...personalDaily,schedules:[
    {key:'one',cadence:'daily',times:['19:00'],reports:[CLOSING_BD]},
    {key:'two',cadence:'weekly',weekday:5,times:['19:00'],reports:[CLOSING_BD,DIRECTOR_REPORT_TITLES[2]]},
  ]};
  const harness=deliveryHarness({overrides:new Map([['mis-a',personal],['mis-b',personal]])});
  assert.deepEqual(await harness.sendScheduledHierarchyReportBundles(at1905Ist),{sent:2,failed:0,skipped:0});
  assert.equal(harness.published.length,1,'identical site/window/report selections share one generated bundle');
  assert.deepEqual(harness.published[0].args.reportTitles,[CLOSING_BD,DIRECTOR_REPORT_TITLES[2]]);
  assert.deepEqual(harness.published[0].args.window,{start:new Date('2026-09-10T13:30:00Z'),end:new Date('2026-09-11T13:30:00Z')});
  assert.equal(harness.published[0].args.scheduleLabel.includes('Daily'),true);
  assert.ok([...harness.claims.values()].every(({args})=>args[2].includes('-one+two-SELECTED-LOCATIONS')));
  assert.deepEqual(harness.sent[0].parameters,harness.sent[1].parameters);
  assert.deepEqual(await harness.sendScheduledHierarchyReportBundles(new Date('2026-09-11T13:40:00Z')),{sent:0,failed:0,skipped:2});
  assert.equal(harness.sent.length,2);
  assert.equal(harness.published.length,1);
  assert.equal(harness.history.length,2);
  assert.deepEqual(harness.errors,[]);
});

test('personal report selection and site permission are enforced after a hierarchy timing rule',async()=>{
  const harness=deliveryHarness({rule:{siteAccess:'Sasti OB',scheduleDays:'Friday',scheduleTimes:'19:00',reportAccess:`${CLOSING_BD} | ${DIRECTOR_REPORT_TITLES[2]}`}});
  assert.deepEqual(await harness.sendScheduledHierarchyReportBundles(at1905Ist),{sent:2,failed:0,skipped:0});
  assert.deepEqual(harness.published.map(({args})=>args.reportTitles),[[CLOSING_BD],[CLOSING_BD,DIRECTOR_REPORT_TITLES[2]]]);
  assert.equal(harness.published[0].args.window.start.toISOString(),'2026-09-10T13:30:00.000Z');
  assert.equal(harness.published[1].args.window.start.toISOString(),'2026-09-04T13:30:00.000Z');
  const disjoint=deliveryHarness({rule:{siteAccess:'Majri OB',reportAccess:CLOSING_BD}});
  assert.deepEqual(await disjoint.sendScheduledHierarchyReportBundles(at1905Ist),{sent:0,failed:0,skipped:2});
  assert.equal(disjoint.activity.sourceReads,0);
  assert.equal(disjoint.claims.size,0);
});

test('disallowed role and personal report rows cannot advance the delivered window or create data gaps',async()=>{
  for(const personal of [false,true]){
    const settings=defaultHierarchyReportScheduleSettings();
    const schedules=[
      {key:'unpermitted',enabled:true,cadence:'daily',times:['08:00','18:00'],reports:[DIRECTOR_REPORT_TITLES[3]]},
      {key:'closing',enabled:true,cadence:'daily',times:['19:00'],reports:[CLOSING_BD]},
    ];
    settings.designations.misSupervisor={...settings.designations.misSupervisor,managedByReportSettings:true,schedules};
    const overrides=personal?new Map([['mis-a',{designationKey:'misSupervisor',schedules:structuredClone(schedules)}]]):new Map();
    const saved=structuredClone({settings,overrides});
    const harness=deliveryHarness({settings,overrides,rule:{siteAccess:'Sasti OB',reportAccess:CLOSING_BD}});
    assert.deepEqual(await harness.sendScheduledHierarchyReportBundles(new Date('2026-09-11T12:35:00Z')),{sent:0,failed:0,skipped:0});
    assert.equal(harness.claims.size,0);
    assert.equal(harness.activity.sourceReads,0,'a row with no permitted reports cannot trigger report loading');
    assert.deepEqual(await harness.sendScheduledHierarchyReportBundles(at1905Ist),{sent:2,failed:0,skipped:0});
    assert.equal(harness.published.length,1,'both recipients can reuse the permitted site bundle');
    assert.deepEqual(harness.published[0].args.reportTitles,[CLOSING_BD]);
    assert.deepEqual(harness.published[0].args.window,{
      start:new Date('2026-09-10T13:30:00Z'),end:new Date('2026-09-11T13:30:00Z'),
    },'the previous real report slot is yesterday at 19:00, not the skipped 18:00 row');
    assert.deepEqual({settings,overrides},saved,'permission filtering must not rewrite stored role or personal choices');
    assert.deepEqual(harness.errors,[]);
  }
});

test('recipient login normalization selects the matching override and scheduled failures record status',async()=>{
  const users=[{employee:' MIS A ',phone:'911111111111',site:'Sasti OB',userType:'Mobile User',userGroup:'MIS User'}];
  const harness=deliveryHarness({users,overrides:new Map([['mis a',personalDaily]])});
  assert.deepEqual(await harness.sendScheduledHierarchyReportBundles(at1905Ist),{sent:1,failed:0,skipped:0});
  assert.deepEqual(harness.published[0].args.reportTitles,[CLOSING_BD]);
  assert.equal([...harness.claims.values()][0].args[1],'mis a');
  const failed=deliveryHarness({users:[{...users[0],login:'mis-a'}],fail:true});
  assert.deepEqual(await failed.sendScheduledHierarchyReportBundles(at1905Ist),{sent:0,failed:1,skipped:0});
  assert.equal(failed.sent.length,0);
  assert.equal(failed.history[0][5],'Failed - Template unavailable');
  assert.equal([...failed.claims.values()][0].status,'Failed - Template unavailable');
  assert.equal(failed.errors.length,1);
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
  assert.match(page,/className="report-schedule-owner"><span>My report schedule<\/span><b>\{reportScheduleOwner\.name/);
  assert.match(page,/Customised by you/);
  assert.match(page,/<RotateCcw \/> Use role default/);
  assert.match(page,/JSON\.stringify\(\{ resetToDefault: true \}\)/);
  assert.match(page,/reportAccess\.canManageAll \? reportScheduleSettings : \{ userSchedule: userReportSchedule \}/);
  assert.match(page,/reportAccess\.allowedReports\.map\(\(title\) =>/);
  assert.match(page,/<span>User role<\/span>/);
  assert.match(page,/setUserScheduleCustomised\(Boolean\(details\.userSchedule\)\)/);
});
