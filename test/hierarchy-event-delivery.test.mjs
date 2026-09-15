import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultHierarchyReportScheduleSettings,HIERARCHY_REPORT_DESIGNATIONS,reportsForHierarchyEvent} from '../hierarchy-report-flow.mjs';
import {DIRECTOR_REPORT_TITLES} from '../director-report-bundle.mjs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const request={ref:'REQ/123',site:'Sasti OB',requesterLogin:'production',status:'Open'};

test('no designation receives per-event reports even with legacy event schedules',()=>{
  for(const designation of [...Object.keys(HIERARCHY_REPORT_DESIGNATIONS),'unknown']){
    const settings={designations:{[designation]:{enabled:true,schedules:[{key:'every-event',enabled:true,eventBased:true,cadence:'event',reports:DIRECTOR_REPORT_TITLES}]}}};
    for(const type of ['opened','closed','verified','idle',undefined]){
      assert.deepEqual(reportsForHierarchyEvent(designation,{type,request}),[],`${designation}: ${type}`);
      assert.deepEqual(reportsForHierarchyEvent(designation,{type,request},settings),[],`${designation}: legacy ${type}`);
    }
  }
  assert.deepEqual(reportsForHierarchyEvent(),[]);
  assert.deepEqual(reportsForHierarchyEvent(null,null,null),[]);
});

test('disabled designations, schedules and unselected reports do not send events',()=>{
  const settings=defaultHierarchyReportScheduleSettings();
  const config=settings.designations.productionSupervisor;
  config.enabled=false;
  assert.deepEqual(reportsForHierarchyEvent('productionSupervisor',{type:'opened',request},settings),[]);
  config.enabled=true;config.schedules[0].enabled=false;
  assert.deepEqual(reportsForHierarchyEvent('productionSupervisor',{type:'opened',request},settings),[]);
  config.schedules[0].enabled=true;config.schedules[0].reports=[DIRECTOR_REPORT_TITLES[1]];
  assert.deepEqual(reportsForHierarchyEvent('productionSupervisor',{type:'opened',request},settings),[]);
  assert.deepEqual(reportsForHierarchyEvent('productionSupervisor',{type:'closed',request},settings),[]);
});

function deliveryHarness({databaseReady=true}={}){
  const calls=[];
  const forbidden=(name)=>(...args)=>{calls.push({name,args});throw new Error(`Event reports must not call ${name}`);};
  // Event entry points must exit before resolving a recipient, reading settings
  // or source data, claiming a run, publishing a file or touching a transport.
  const dependencies={
    databaseReady,pool:{query:forbidden('pool.query')},console:{error:forbidden('console.error')},
    ...Object.fromEntries([
      'storedWhatsAppReportSettings','whatsappPurposeEnabled','storedHierarchyReportScheduleSettings','storedUserReportScheduleOverrides',
      'reportRecipientLogin','resolveMobileAccess','flowDesignationForUser','hierarchyRuleForDesignation','applyHierarchyDeliveryRule',
      'applyUserReportScheduleOverride','reportsDueForDesignation','hierarchyRecipientReportScope','hierarchyAccessAllowsReport',
      'directorReportSourceData','reportSites','displaySiteName','publishDirectorReportFiles','publicBaseUrl',
      'metaWhatsAppRuntimeEnv','sendMetaWhatsAppTemplate','sendMetaWhatsAppText',
    ].map((name)=>[name,forbidden(name)])),
  };
  const snippet=server.slice(server.indexOf('function combineReportWindowGroups('),server.indexOf("app.post('/api/reports/director/send-test'"));
  assert.ok(snippet.includes('async function sendScheduledHierarchyReportBundles('));
  const api=new Function(...Object.keys(dependencies),`${snippet};return {sendRequestEventReports,sendScheduledHierarchyReportBundles};`)(...Object.values(dependencies));
  return {...api,calls};
}

test('request event report hooks are no-ops for all lifecycle events, concurrent calls and repeated requests',async()=>{
  const harness=deliveryHarness();
  const results=await Promise.all(['opened','closed','verified','idle','opened'].map((type)=>harness.sendRequestEventReports(type,request)));
  results.push(await harness.sendRequestEventReports('opened',{...request,ref:'REQ/124',site:'Majri OB'}));
  results.push(await harness.sendRequestEventReports());
  for(const result of results){
    assert.equal(result.skipped,true);
    assert.match(result.reason,/reports are consolidated at scheduled times/);
    assert.equal(result.sent||0,0);
  }
  assert.deepEqual(harness.calls,[]);
});

test('the scheduler rejects event invocations even at a due time before reading settings or accessing unavailable services',async()=>{
  for(const databaseReady of [true,false]){
    const harness=deliveryHarness({databaseReady});
    for(const event of [{type:'opened',request},{type:'closed',request},{type:'verified',request},{}]){
      const result=await harness.sendScheduledHierarchyReportBundles(new Date('2026-09-11T13:35:00Z'),event);
      assert.equal(result.skipped,true);
      assert.match(result.reason,/Individual events use alerts/);
    }
    assert.equal((await harness.sendRequestEventReports('closed',request)).skipped,true);
    assert.deepEqual(harness.calls,[],'event reports never depend on database or delivery availability');
  }
});

test('saved request paths retain the harmless compatibility report hooks',()=>{
  assert.equal(server.split("await sendRequestEventReports('opened',rows[0])").length-1,1);
  assert.equal(server.split("await sendRequestEventReports('closed',rows[0])").length-1,2);
  assert.equal(server.split("void sendRequestEventReports('verified',rows[0])").length-1,1);
  assert.match(server,/if\(!rows\.length\)\{[\s\S]*status changed[\s\S]*\}\s*res\.json\(rows\[0\]\);\s*void sendRequestEventReports\('verified'/);
});
