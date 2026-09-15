import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hierarchyRecipientReportScope} from '../hierarchy-report-scope.mjs';
import {canonicalSiteName} from '../site-location.mjs';
import {displaySiteName,reportScopeIncludesSite} from '../region-scope.mjs';
import {resolveMobileAccess} from '../mobile-access.mjs';
import {applyHierarchyDeliveryRule,defaultHierarchyReportScheduleSettings,flowDesignationForUser,reportsDueForDesignation,applyUserReportScheduleOverride} from '../hierarchy-report-flow.mjs';
import {DIRECTOR_REPORT_TITLES} from '../director-report-bundle.mjs';
import {hierarchyAccessAllowsReport} from '../hierarchy-report-catalogue.mjs';
import {reportSites} from '../site-consolidated-report.mjs';

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

test('manager jobs stay site-scoped when legacy account permissions fall back to Admin',()=>{
  for(const fields of [{adminLevel:'Project Manager'},{adminLevel:'Admin',designation:'Project Manager'},{adminLevel:'Admin',managerRole:'Project Manager'}]){
    const user=Object.freeze({userType:'Super User',managerSites:'SASTI II | Majri OB',managerRegion:'All',...fields});
    const profile=resolveMobileAccess({user});
    assert.equal(profile.permissions.adminLevel,'Admin','fixture must exercise the Admin permission fallback');
    assert.deepEqual(hierarchyRecipientReportScope(user,profile),{sites:['sasti ob','majri ob']});
    assert.deepEqual(scope(user,'Majri OB | Jayant OB'),{sites:['majri ob']});
    assert.deepEqual(scope(user,'Jayant OB'),{sites:[]});
    assert.deepEqual(scope({...user,managerSites:'',managerRegion:''}),{sites:[]});
    const regional=scope({...user,managerSites:'',managerRegion:'WCL'});
    assert.equal(reportScopeIncludesSite(regional,'Sasti OB'),true);
    assert.equal(reportScopeIncludesSite(regional,'Jayant OB'),false);
  }
});

test('real Super Admin overrides manager job labels and Director on Admin retains global authority',()=>{
  for(const user of [
    {userType:'Super User',adminLevel:'Super Admin',designation:'Project Manager',managerRole:'Maintenance Manager',managerSites:'Sasti OB'},
    {userType:'Super User',adminLevel:' Super   Admin ',designation:'Director',managerRole:'Project Manager',managerSites:'Sasti OB'},
    {userType:'Super User',adminLevel:'Admin',designation:'Director',managerSites:'Sasti OB'},
  ]){
    assert.deepEqual(scope(user),{sites:null});
    assert.deepEqual(scope(user,'Jayant OB'),{sites:['jayant ob']});
    assert.deepEqual(scope(user,' | '),{sites:[]});
  }
  assert.deepEqual(scope(manager({designation:'Director',managerSites:'Sasti OB'})),{sites:['sasti ob']});
});

test('mobile report scope resolves the assigned site ahead of region fields and skips blank assignments',()=>{
  for(const userGroup of ['Production User','Maintenance User','MIS User']){
    for(const [fields,expected] of [
      [{site:' SASTI II ',location:'WCL',region:'All'},['sasti ob']],
      [{site:' \t',location:'Majri II',region:'WCL'},['majri ob']],
      [{site:'',location:' \t',currentLocation:'Sasti OB',region:'WCL'},['sasti ob']],
      [{site:'',location:'',currentLocation:'',region:'WCL'},[]],
    ]){
      const user=Object.freeze(mobile({userGroup,managerRegion:'All',managerSites:'Jayant OB',...fields}));
      assert.deepEqual(scope(user),{sites:expected});
      assert.deepEqual(scope(user,'Jayant OB'),{sites:[]});
    }
  }
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
const recipientSnippet=server.slice(server.indexOf('function reportRecipientLogin('),server.indexOf('function userReportScheduleSettingKey('));
const reportRecipientLogin=new Function(`${recipientSnippet};return reportRecipientLogin;`)();
const schedulerSnippet=server.slice(server.indexOf('function combineReportWindowGroups('),server.indexOf("app.post('/api/reports/director/send-test'"));
const data={
  requests:[{ref:'S',site:'Sasti OB'},{ref:'M',site:'Majri OB'},{ref:'J',site:'Jayant OB'}],
  equipmentRecords:[{id:'S',currentLocation:'Sasti OB'},{id:'M',currentLocation:'Majri OB'},{id:'J',currentLocation:'Jayant OB'}],
  transferRecords:[{id:'S',destination:'Sasti OB'},{id:'M',destination:'Majri OB'},{id:'J',destination:'Jayant OB'}],
};

const at1900Ist=new Date('2026-09-08T13:30:00Z');

function deliveryHarness(users,{siteAccess=null,reportAccess=DIRECTOR_REPORT_TITLES.join(' | '),sourceData=data,scheduleSettings=defaultHierarchyReportScheduleSettings()}={}){
  const published=[],claims=[],sent=[],history=[],updates=[],errors=[],queries=[],sourceReads=[],claimedKeys=new Set();
  const recipients=users.map((user,index)=>({phone:`9100000000${String(index).padStart(2,'0')}`,...user}));
  const dependencies={
    databaseReady:true,storedWhatsAppReportSettings:async()=>({}),whatsappPurposeEnabled:()=>true,
    storedHierarchyReportScheduleSettings:async()=>scheduleSettings,storedUserReportScheduleOverrides:async()=>new Map(),applyUserReportScheduleOverride,
    pool:{query:async(sql,args=[])=>{
      queries.push({sql,args});
      if(sql.includes("master_name='Users & employees'"))return {rows:recipients.map(record_data=>({record_data}))};
      if(sql.includes("master_name='Hierarchy master'"))return {rows:[]};
      if(sql.startsWith('INSERT INTO whatsapp_consolidated_report_runs')){
        const key=JSON.stringify(args);
        if(claimedKeys.has(key))return {rows:[],rowCount:0};
        claimedKeys.add(key);
        claims.push(args);return {rows:[{id:claims.length}],rowCount:1};
      }
      if(sql.startsWith('UPDATE whatsapp_consolidated_report_runs'))updates.push(args);
      else if(sql.startsWith('INSERT INTO whatsapp_alert_history'))history.push(args);
      else throw new Error(`Unexpected scope harness query: ${sql}`);
      return {rows:[],rowCount:1};
    }},
    reportRecipientLogin,resolveMobileAccess,flowDesignationForUser,applyHierarchyDeliveryRule,reportsDueForDesignation,
    hierarchyRecipientReportScope,hierarchyAccessAllowsReport,reportSites,displaySiteName,
    directorReportSourceData:async()=>{sourceReads.push(sourceData);return sourceData;},
    hierarchyRuleForDesignation:()=>siteAccess===null?null:{siteAccess,reportAccess},
    publishDirectorReportFiles:async args=>{
      assert.equal(args.sourceData,sourceData,'scheduler must pass the loaded source into publication');
      const filtered=sourceDataForSites(args.sourceData,args.siteAccess);
      const message=JSON.stringify({site:args.siteAccess,reportTitles:args.reportTitles,
        requestIds:filtered.requests.map(row=>row.ref),equipmentIds:filtered.equipmentRecords.map(row=>row.id),transferIds:filtered.transferRecords.map(row=>row.id)});
      published.push({args,data:filtered,message});return {message};
    },
    publicBaseUrl:()=> 'https://example.invalid',metaWhatsAppRuntimeEnv:async()=>({}),
    sendMetaWhatsAppTemplate:async args=>sent.push(args),
    console:{error:(...args)=>errors.push(args)},
  };
  const run=new Function(...Object.keys(dependencies),`${schedulerSnippet};return sendScheduledHierarchyReportBundles;`)(...Object.values(dependencies));
  return {run,published,claims,sent,history,updates,errors,queries,sourceReads,recipients};
}

function assertRecipientSites(harness,recipientIndex,sites){
  const recipient=harness.recipients[recipientIndex];
  const messages=harness.sent.filter(message=>message.to===recipient.phone);
  assert.deepEqual(messages.map(message=>JSON.parse(message.parameters[0]).site).sort(),[...sites].sort());
  for(const message of messages){
    assert.equal(message.templateKey,'consolidatedRequestReport');
    assert.equal(message.purpose,'consolidatedRequestReport');
    assert.equal(message.parameters.length,1);
    assert.ok(harness.published.some(bundle=>bundle.message===message.parameters[0]),'send must reference a published site bundle');
  }
  const claims=harness.claims.filter(([,login])=>login===reportRecipientLogin(recipient));
  assert.equal(claims.length,sites.length);
  assert.deepEqual(claims.map(([, ,key])=>key.split('-SITE-')[1]).sort(),[...sites].sort());
  assert.equal(new Set(claims.map(([slot,login,key])=>JSON.stringify([slot,login,key]))).size,claims.length);
  const history=harness.history.filter(row=>row[4]===recipient.phone);
  assert.deepEqual(history.map(row=>row[1]).sort(),sites.map(displaySiteName).sort());
  assert.ok(history.every(row=>row[5]==='Sent'));
}

function assertIsolatedPublications(harness,source=data){
  assert.deepEqual(harness.errors,[]);
  assert.equal(harness.updates.length,harness.sent.length);
  assert.ok(harness.updates.every(([status])=>status==='Sent'));
  for(const {args,data:filtered} of harness.published){
    assert.ok(args.siteAccess,'global access still publishes one named site at a time');
    assert.equal(args.siteAccess,canonicalSiteName(args.siteAccess));
    assert.doesNotMatch(args.siteAccess,/\|/);
    assert.ok(args.window.start<args.window.end);
    assert.equal(args.window.end.toISOString(),at1900Ist.toISOString());
    assert.deepEqual(filtered.requests.map(row=>row.ref),source.requests.filter(row=>canonicalSiteName(row.site)===args.siteAccess).map(row=>row.ref));
    assert.deepEqual(filtered.equipmentRecords.map(row=>row.id),source.equipmentRecords.filter(row=>canonicalSiteName(row.currentLocation)===args.siteAccess).map(row=>row.id));
    assert.deepEqual(filtered.transferRecords.map(row=>row.id),source.transferRecords.filter(row=>canonicalSiteName(row.destination)===args.siteAccess).map(row=>row.id));
  }
}

test('scheduled publication isolates all record types and sends each permitted manager site separately',async()=>{
  const before=structuredClone(data);
  const harness=deliveryHarness([mobile(),manager({managerSites:'SASTI II | Majri OB',managerRegion:'All'})],{siteAccess:''});
  const result=await harness.run(at1900Ist);
  assert.equal(result.sent,3);assert.equal(result.failed,0);
  assertRecipientSites(harness,0,['sasti ob']);
  assertRecipientSites(harness,1,['sasti ob','majri ob']);
  assert.equal(harness.published.length,3);
  assert.ok(harness.published.every(item=>item.args.siteAccess!=='jayant ob'));
  assertIsolatedPublications(harness);
  assert.equal(harness.sourceReads.length,1);
  assert.deepEqual(data,before);
});

test('designation site rules intersect manager assignments and cannot broaden mobile users',async()=>{
  const harness=deliveryHarness([mobile({managerRegion:'All',managerSites:'Jayant OB'}),manager({managerSites:'Sasti OB | Majri OB',managerRegion:'All'})],{siteAccess:'Sasti OB | Jayant OB'});
  const result=await harness.run(at1900Ist);
  assert.equal(result.sent,2);assert.equal(result.failed,0);
  assertRecipientSites(harness,0,['sasti ob']);
  assertRecipientSites(harness,1,['sasti ob']);
  assertIsolatedPublications(harness);
});

test('scheduler keeps Admin-fallback manager jobs and mobile region records within assigned sites',async()=>{
  const harness=deliveryHarness([
    {login:'project',userType:'Super User',adminLevel:'Project Manager',managerSites:'Sasti OB | Majri OB',managerRegion:'All'},
    mobile({login:'assigned-site',site:'SASTI II',location:'WCL',region:'All'}),
    mobile({login:'legacy-site',site:' \t',location:'Majri II',region:'WCL'}),
    {login:'unassigned-project',userType:'Super User',adminLevel:'Admin',designation:'Project Manager'},
  ]);
  const result=await harness.run(at1900Ist);
  assert.equal(result.sent,4);assert.equal(result.failed,0);
  assertRecipientSites(harness,0,['sasti ob','majri ob']);
  assertRecipientSites(harness,1,['sasti ob']);
  assertRecipientSites(harness,2,['majri ob']);
  assertRecipientSites(harness,3,[]);
  assert.ok(harness.published.every(item=>['sasti ob','majri ob'].includes(item.args.siteAccess)));
  assertIsolatedPublications(harness);
});

test('unassigned and designation-disjoint recipients never claim, publish or send a scheduled bundle',async()=>{
  for(const siteAccess of [null,'Sasti OB',' | ']){
    const harness=deliveryHarness([mobile({site:''}),manager({})],{siteAccess});
    assert.equal((await harness.run(at1900Ist)).sent,0);
    assert.equal(harness.claims.length,0);assert.equal(harness.published.length,0);assert.equal(harness.sent.length,0);
    assert.equal(harness.sourceReads.length,0);assert.deepEqual(harness.errors,[]);
  }
  const disjoint=deliveryHarness([mobile(),manager({managerRegion:'WCL'})],{siteAccess:'Jayant OB'});
  assert.equal((await disjoint.run(at1900Ist)).sent,0);
  assert.equal(disjoint.claims.length,0);assert.equal(disjoint.published.length,0);assert.equal(disjoint.sent.length,0);
  assert.equal(disjoint.sourceReads.length,0);assert.deepEqual(disjoint.errors,[]);
});

test('admin, super admin and director receive separate global site bundles unless hierarchy rules narrow them',async()=>{
  const users=[{login:'director',userType:'Super User',adminLevel:'Admin',designation:'Director'},
    {login:'admin',userType:'Super User',adminLevel:'Admin'},
    {login:'super',userType:'Super User',adminLevel:'Super Admin'}];
  for(const siteAccess of [null,'','SASTI II | Majri OB',' | ']){
    const harness=deliveryHarness(users,{siteAccess});
    const sites=siteAccess===' | '?[]:siteAccess?['sasti ob','majri ob']:['sasti ob','majri ob','jayant ob'];
    const result=await harness.run(at1900Ist);
    assert.equal(result.sent,users.length*sites.length);assert.equal(result.failed,0);
    users.forEach((_,index)=>assertRecipientSites(harness,index,sites));
    assertIsolatedPublications(harness);
    assert.equal(harness.sourceReads.length,sites.length?1:0);
    // Admin and Super Admin can share identical files, but each site has its own publication.
    assert.deepEqual([...new Set(harness.published.map(item=>item.args.siteAccess))].sort(),[...sites].sort());
    const sent=harness.sent.length,published=harness.published.length,claims=harness.claims.length;
    assert.equal((await harness.run(at1900Ist)).sent,0);
    assert.equal(harness.sent.length,sent);assert.equal(harness.published.length,published);assert.equal(harness.claims.length,claims);
  }
});

test('global site discovery retains equipment-only sites even when there is no request activity',async()=>{
  const sourceData={requests:[],equipmentRecords:data.equipmentRecords,transferRecords:[]};
  const harness=deliveryHarness([{login:'admin',userType:'Super User',adminLevel:'Admin'}],{sourceData});
  const result=await harness.run(at1900Ist);
  assert.equal(result.sent,3);assert.equal(result.failed,0);
  assertRecipientSites(harness,0,['sasti ob','majri ob','jayant ob']);
  assert.equal(harness.published.length,3);
  assertIsolatedPublications(harness,sourceData);
  assert.ok(harness.published.every(item=>item.data.equipmentRecords.length===1&&item.data.requests.length===0));
});

test('same-window schedules combine into one bundle per authorized site and still enforce report access',async()=>{
  const scheduleSettings=defaultHierarchyReportScheduleSettings();
  scheduleSettings.designations.maintenanceManager.schedules=[
    {key:'first',enabled:true,cadence:'daily',times:['19:00'],reports:[DIRECTOR_REPORT_TITLES[0],DIRECTOR_REPORT_TITLES[1]]},
    {key:'second',enabled:true,cadence:'daily',times:['19:00'],reports:[DIRECTOR_REPORT_TITLES[0],DIRECTOR_REPORT_TITLES[2]]},
  ];
  const harness=deliveryHarness([manager({managerSites:'Sasti OB | Majri OB'})],{siteAccess:'Sasti OB | Majri OB | Jayant OB',reportAccess:DIRECTOR_REPORT_TITLES[0],scheduleSettings});
  const result=await harness.run(at1900Ist);
  assert.equal(result.sent,2);assert.equal(result.failed,0);
  assertRecipientSites(harness,0,['sasti ob','majri ob']);
  assert.equal(harness.published.length,2);
  assertIsolatedPublications(harness);
  for(const {args} of harness.published)assert.deepEqual(args.reportTitles,[DIRECTOR_REPORT_TITLES[0]]);
});

test('event calls cannot bypass scheduled delivery or recipient site authorization',async()=>{
  for(const site of ['Sasti OB','Jayant OB']){
    const harness=deliveryHarness([mobile(),manager({managerSites:'Sasti OB'})]);
    const result=await harness.run(at1900Ist,{type:'opened',request:{ref:'EVENT',site,requesterLogin:'mobile'}});
    assert.equal(result.skipped,true);assert.match(result.reason,/scheduled times/);
    assert.equal(harness.queries.length,0);assert.equal(harness.sourceReads.length,0);
    assert.equal(harness.claims.length,0);assert.equal(harness.published.length,0);assert.equal(harness.sent.length,0);
    assert.deepEqual(harness.errors,[]);
  }
});
