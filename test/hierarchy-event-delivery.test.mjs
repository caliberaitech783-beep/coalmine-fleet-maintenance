import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultHierarchyReportScheduleSettings,reportsForHierarchyEvent,reportsDueForDesignation,flowDesignationForUser} from '../hierarchy-report-flow.mjs';
import {DIRECTOR_REPORT_TITLES} from '../director-report-bundle.mjs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const request={ref:'REQ/123',site:'Sasti OB',requesterLogin:'production',status:'Open'};

test('event schedules select only the matching report and use a stable per-request event key',()=>{
  for(const [index,type] of ['opened','closed','verified'].entries()){
    const groups=reportsForHierarchyEvent('productionSupervisor',{type,request});
    assert.equal(groups.length,1);
    assert.deepEqual(groups[0].reports,[DIRECTOR_REPORT_TITLES[index]]);
    assert.deepEqual(groups,reportsForHierarchyEvent('productionSupervisor',{type,request}));
    assert.notEqual(groups[0].slotKey,reportsForHierarchyEvent('productionSupervisor',{type,request:{...request,ref:'REQ/124'}})[0].slotKey);
  }
  assert.deepEqual(reportsForHierarchyEvent('misSupervisor',{type:'opened',request}),[]);
  assert.deepEqual(reportsForHierarchyEvent('director',{type:'opened',request}),[]);
  assert.deepEqual(reportsForHierarchyEvent('unknown',{type:'opened',request}),[]);
  assert.deepEqual(reportsForHierarchyEvent('productionSupervisor',{type:'idle',request}),[]);
  assert.deepEqual(reportsForHierarchyEvent('productionSupervisor',{type:'opened',request:{}}),[]);
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
  assert.equal(reportsForHierarchyEvent('productionSupervisor',{type:'closed',request},settings).length,1);
});

function deliveryHarness({fail=false,selected=true,siteAllowed=true}={}){
  const settings=defaultHierarchyReportScheduleSettings();
  settings.designations.productionSupervisor.allRecipients=false;
  settings.designations.productionSupervisor.recipientLogins=selected?['production']:[];
  const sent=[],published=[],history=[],claims=new Set();
  const users=[{login:'production',phone:'919999999999'},{login:'other-site',phone:'918888888888'}];
  const dependencies={databaseReady:true,
    pool:{query:async(sql,args=[])=>{
      if(sql.includes("master_name='Users & employees'"))return {rows:users.map(record_data=>({record_data}))};
      if(sql.includes("master_name='Hierarchy master'"))return {rows:[]};
      if(sql.startsWith('INSERT INTO whatsapp_consolidated_report_runs')){
        const key=args.join('|');if(claims.has(key))return {rowCount:0,rows:[]};claims.add(key);return {rowCount:1,rows:[{id:claims.size}]};
      }
      if(sql.includes('INSERT INTO whatsapp_alert_history'))history.push(args);
      return {rows:[],rowCount:1};
    }},
    storedHierarchyReportScheduleSettings:async()=>settings,
    requestStakeholderLogins:async()=>['production'],
    resolveMobileAccess:()=>({assignedRole:'Production User'}),flowDesignationForUser,reportsForHierarchyEvent,reportsDueForDesignation,
    hierarchyRuleForDesignation:()=>({siteAccess:'Sasti OB',reportAccess:DIRECTOR_REPORT_TITLES.join('|')}),
    splitHierarchyValues:value=>value.split('|'),
    sourceDataForSites:data=>({...data,requests:siteAllowed?data.requests:[]}),
    publishDirectorReportFiles:async args=>{published.push(args);return {message:'Event report\nPDF https://example.com/report'}},
    publicBaseUrl:()=> 'https://example.com',metaWhatsAppRuntimeEnv:async()=>({}),
    sendMetaWhatsAppTemplate:async args=>{if(fail)throw new Error('Template unavailable');sent.push(args)},
    sendMetaWhatsAppText:async()=>{throw new Error('Delivery unavailable')},
    console:{error:()=>{}},
  };
  const snippet=server.slice(server.indexOf('let hierarchyReportRunning=false;'),server.indexOf("app.post('/api/reports/director/send-test'"));
  const api=new Function(...Object.keys(dependencies),`${snippet};return {sendRequestEventReports};`)(...Object.values(dependencies));
  return {...api,sent,published,history};
}

test('event delivery honors recipients and site scope, publishes one request, and deduplicates repeats',async()=>{
  const harness=deliveryHarness();
  const results=await Promise.all([harness.sendRequestEventReports('opened',request),harness.sendRequestEventReports('opened',{...request,ref:'REQ/124'})]);
  assert.deepEqual(results.map(result=>result.sent),[1,1]);
  assert.equal(harness.sent.length,2);
  assert.equal(harness.sent[0].templateKey,'consolidatedRequestReport');
  assert.equal(harness.sent[0].parameters[0].includes('\n'),false);
  assert.deepEqual(harness.published[0].eventRequest,request);
  assert.deepEqual(harness.published[0].reportTitles,[DIRECTOR_REPORT_TITLES[0]]);
  await harness.sendRequestEventReports('opened',request);
  assert.equal(harness.sent.length,2);
  for(const options of [{selected:false},{siteAllowed:false}]){
    const excluded=deliveryHarness(options);await excluded.sendRequestEventReports('opened',request);
    assert.equal(excluded.sent.length,0);assert.equal(excluded.published.length,0);
  }
});

test('failed delivery is recorded and does not throw after a request was saved',async()=>{
  const harness=deliveryHarness({fail:true});
  const result=await harness.sendRequestEventReports('opened',request);
  assert.equal(result.failed,1);
  assert.match(harness.history[0][5],/^Failed - Delivery unavailable/);
});

test('creation, both closing paths and verification invoke event delivery after successful writes',()=>{
  assert.equal(server.split("await sendRequestEventReports('opened',rows[0])").length-1,1);
  assert.equal(server.split("await sendRequestEventReports('closed',rows[0])").length-1,2);
  assert.equal(server.split("await sendRequestEventReports('verified',rows[0])").length-1,1);
  assert.match(server,/if\(!rows.length\)return res.status\(409\).json\(\{error:'Only unverified closed requests can be verified.'\}\);\s*await sendRequestEventReports\('verified'/);
  assert.match(server,/if\(eventRequest\)sourceData.requests=sourceDataForSites\(\{requests:\[eventRequest\]/);
});
