import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hierarchyRecipientReportScope} from '../hierarchy-report-scope.mjs';
import {canonicalSiteName} from '../site-location.mjs';
import {reportScopeIncludesSite} from '../region-scope.mjs';
import {resolveMobileAccess} from '../mobile-access.mjs';
import {applyHierarchyDeliveryRule,defaultHierarchyReportScheduleSettings,flowDesignationForUser,reportsDueForDesignation,reportsForHierarchyEvent,applyUserReportScheduleOverride} from '../hierarchy-report-flow.mjs';
import {DIRECTOR_REPORT_TITLES} from '../director-report-bundle.mjs';
import {hierarchyAccessAllowsReport} from '../hierarchy-report-catalogue.mjs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const mobile=(fields={})=>({login:'mobile',userType:'Mobile User',userGroup:'Production User',site:'Sasti OB',...fields});
const manager=(fields={})=>({login:'manager',userType:'Super User',adminLevel:'Manager',managerRole:'Maintenance Manager',...fields});
const scope=(user,rule='')=>hierarchyRecipientReportScope(user,resolveMobileAccess({user}),rule);

test('mobile reports use only the assigned site, intersect rules and ignore manager-only fields',()=>{
  for(const userGroup of ['Production User','Maintenance User','MIS User']){
    const user=Object.freeze(mobile({userGroup,managerRegion:'All',managerSites:'Majri OB | Jayant OB'}));
    assert.deepEqual(scope(user),{sites:['sasti ob']});
    assert.deepEqual(scope(user,'SASTI II | Majri OB'),{sites:['sasti ob']});
    assert.deepEqual(scope(user,'Majri OB'),{sites:[]});
    assert.equal(user.site,'Sasti OB');
  }
  assert.deepEqual(scope(mobile({site:'',location:'Majri OB'})),{sites:['majri ob']});
});

test('manager scopes preserve explicit sites, region assignments and custom QA sites without broadening',()=>{
  const user=Object.freeze(manager({managerSites:'SASTI II | Majri OB',managerRegion:'All'}));
  assert.deepEqual(scope(user),{sites:['sasti ob','majri ob']});
  assert.deepEqual(scope(user,'Majri OB | Jayant OB'),{sites:['majri ob']});
  const wcl=scope(manager({managerRegion:'WCL'}));
  assert.equal(wcl.sites.length,5);
  assert.equal(reportScopeIncludesSite(wcl,'Jayant OB'),false);
  assert.deepEqual(scope(manager({managerRegion:'WCL'}),'Jayant OB'),{sites:[]});
  assert.deepEqual(scope(manager({managerSites:'QA BDMS UNIQUE'})),{sites:['qa bdms unique']});
  assert.deepEqual(scope(manager({managerRegion:'All'})),{sites:null});
  assert.deepEqual(scope(manager({managerRegion:'All'}),'Sasti OB'),{sites:['sasti ob']});
});

test('unassigned or disjoint recipient scopes fail closed, while authorized admin/director all-sites access remains',()=>{
  for(const user of [mobile({site:''}),manager({}),manager({managerRegion:'invalid'})])assert.deepEqual(scope(user),{sites:[]});
  assert.deepEqual(hierarchyRecipientReportScope({},{}),{sites:[]});
  assert.deepEqual(scope(mobile(),' | '),{sites:[]});
  for(const adminLevel of ['Admin','Super Admin']){
    const user={userType:'Super User',adminLevel,designation:'Director',site:'Sasti OB'};
    assert.deepEqual(scope(user),{sites:null});
    assert.deepEqual(scope(user,'Sasti OB | Majri OB'),{sites:['sasti ob','majri ob']});
    assert.deepEqual(scope(user,' | '),{sites:[]});
  }
  // A job title cannot promote a site-limited operational account to all sites.
  assert.deepEqual(scope(mobile({designation:'Director'})),{sites:['sasti ob']});
});

const splitHierarchyValues=value=>String(value||'').split(/\s*\|\s*/).map(value=>value.trim()).filter(Boolean);
const sourceSnippet=server.slice(server.indexOf('function sourceDataForSites('),server.indexOf('function hierarchyRuleForDesignation('));
const sourceDataForSites=new Function('splitHierarchyValues','canonicalSiteName',`${sourceSnippet};return sourceDataForSites;`)(splitHierarchyValues,canonicalSiteName);
const schedulerSnippet=server.slice(server.indexOf('let hierarchyReportRunning=false;'),server.indexOf("app.post('/api/reports/director/send-test'"));
const data={
  requests:[{ref:'S',site:'Sasti OB'},{ref:'M',site:'Majri OB'},{ref:'J',site:'Jayant OB'}],
  equipmentRecords:[{id:'S',currentLocation:'Sasti OB'},{id:'M',currentLocation:'Majri OB'},{id:'J',currentLocation:'Jayant OB'}],
  transferRecords:[{id:'S',destination:'Sasti OB'},{id:'M',destination:'Majri OB'},{id:'J',destination:'Jayant OB'}],
};

function deliveryHarness(users,{siteAccess=null}={}){
  const published=[],claims=[],sent=[];
  const dependencies={
    databaseReady:true,storedWhatsAppReportSettings:async()=>({}),whatsappPurposeEnabled:()=>true,
    storedHierarchyReportScheduleSettings:async()=>defaultHierarchyReportScheduleSettings(),storedUserReportScheduleOverrides:async()=>new Map(),applyUserReportScheduleOverride,
    pool:{query:async(sql,args=[])=>{
      if(sql.includes("master_name='Users & employees'"))return {rows:users.map(user=>({record_data:{phone:'910000000000',...user}}))};
      if(sql.includes("master_name='Hierarchy master'"))return {rows:[]};
      if(sql.startsWith('INSERT INTO whatsapp_consolidated_report_runs')){
        claims.push(args);return {rows:[{id:claims.length}],rowCount:1};
      }
      return {rows:[],rowCount:1};
    }},
    requestStakeholderLogins:async()=>users.map(user=>user.login),
    resolveMobileAccess,flowDesignationForUser,applyHierarchyDeliveryRule,reportsDueForDesignation,reportsForHierarchyEvent,
    hierarchyRecipientReportScope,reportScopeIncludesSite,splitHierarchyValues,hierarchyAccessAllowsReport,
    hierarchyRuleForDesignation:()=>siteAccess===null?null:{siteAccess,reportAccess:DIRECTOR_REPORT_TITLES.join(' | ')},
    publishDirectorReportFiles:async args=>{
      const filtered=sourceDataForSites(data,args.siteAccess);
      published.push({args,data:filtered});return {message:'Labelled fake test report'};
    },
    publicBaseUrl:()=> 'https://example.invalid',metaWhatsAppRuntimeEnv:async()=>({}),
    hierarchyReportMessagePurpose:()=> 'consolidatedRequestReport',
    sendMetaWhatsAppTemplate:async args=>sent.push(args),
    sendMetaWhatsAppText:async()=>{throw Error('Unexpected fallback')},reportTemplateFallback:()=>'',
    console:{error:()=>{}},
  };
  const run=new Function(...Object.keys(dependencies),`${schedulerSnippet};return sendScheduledHierarchyReportBundles;`)(...Object.values(dependencies));
  return {run,published,claims,sent};
}

test('scheduled publication scopes mixed request, asset and transfer records for each recipient',async()=>{
  const harness=deliveryHarness([mobile(),manager({managerSites:'Majri OB'})],{siteAccess:''});
  const result=await harness.run(new Date('2026-09-08T13:30:00Z'));
  assert.equal(result.sent,2);
  assert.equal(harness.sent.length,2);
  assert.deepEqual(harness.published.map(item=>item.args.siteAccess),['sasti ob','majri ob']);
  for(const [index,expected] of ['S','M'].entries()){
    assert.deepEqual(harness.published[index].data.requests.map(row=>row.ref),[expected]);
    for(const key of ['equipmentRecords','transferRecords'])assert.deepEqual(harness.published[index].data[key].map(row=>row.id),[expected]);
  }
  assert.equal(data.requests.length,3);
});

test('unassigned and designation-disjoint recipients never claim, publish or send a scheduled bundle',async()=>{
  for(const siteAccess of [null,'Sasti OB']){
    const harness=deliveryHarness([mobile({site:''}),manager({})],{siteAccess});
    assert.equal((await harness.run(new Date('2026-09-08T13:30:00Z'))).sent,0);
    assert.equal(harness.claims.length,0);assert.equal(harness.published.length,0);assert.equal(harness.sent.length,0);
  }
  const disjoint=deliveryHarness([mobile(),manager({managerRegion:'WCL'})],{siteAccess:'Jayant OB'});
  await disjoint.run(new Date('2026-09-08T13:30:00Z'));
  assert.equal(disjoint.claims.length,0);assert.equal(disjoint.published.length,0);
});

test('authorized global director/admin publication is unchanged unless a designation rule narrows it',async()=>{
  const users=[{login:'director',userType:'Super User',adminLevel:'Admin',designation:'Director'},
    {login:'super',userType:'Super User',adminLevel:'Super Admin'}];
  for(const siteAccess of [null,'','Sasti OB']){
    const harness=deliveryHarness(users,{siteAccess});
    assert.equal((await harness.run(new Date('2026-09-08T13:30:00Z'))).sent,2);
    for(const {args,data:filtered} of harness.published){
      assert.equal(args.siteAccess,siteAccess?'sasti ob':'');
      assert.equal(filtered.requests.length,siteAccess?1:3);
    }
  }
});

test('event stakeholders cannot bypass recipient site authorization without a designation site rule',async()=>{
  const harness=deliveryHarness([mobile(),manager({managerSites:'Sasti OB'})]);
  const result=await harness.run(new Date('2026-09-08T13:30:00Z'),{type:'opened',request:{ref:'OUTSIDE',site:'Jayant OB',requesterLogin:'mobile'}});
  assert.equal(result.sent,0);assert.equal(harness.claims.length,0);assert.equal(harness.published.length,0);
});
