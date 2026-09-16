import {siteReportMessageContext,recipientReportMessage} from '../whatsapp-message-format.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultWhatsAppReportSettings,whatsappPurposeEnabled} from '../whatsapp-report-settings.mjs';
import {ticketReportWindow,prepareTicketReportRows,buildTicketReportTable,buildTicketWhatsAppReport} from '../ticket-consolidated-report.mjs';
import {defaultHierarchyReportScheduleSettings,flowDesignationForUser,applyHierarchyDeliveryRule,applyUserReportScheduleOverride,reportsDueForDesignation} from '../hierarchy-report-flow.mjs';
import {resolveMobileAccess} from '../mobile-access.mjs';
import {displaySiteName,reportScopeIncludesSite} from '../region-scope.mjs';
import {hierarchyRecipientReportScope} from '../hierarchy-report-scope.mjs';
import {canonicalSiteName} from '../site-location.mjs';
import {buildSiteReportMessage,reportSites,siteReportFilename,timestampInReportWindow} from '../site-consolidated-report.mjs';
import {formatDisplayDateTime} from '../date-time-format.mjs';
import {whatsAppRecipientRole} from '../whatsapp-workflow-policy.mjs';
import {scheduledReportWindowsDue} from '../report-delivery-window.mjs';

const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const now=new Date('2026-09-15T15:00:00+05:30');
const users=[
  {login:'admin',userType:'Super User',adminLevel:'Admin',phone:'9000000001'},
  {login:'super',userType:'Super User',adminLevel:'Super Admin',phone:'9000000002'},
  {login:'manager',userType:'Super User',adminLevel:'Manager',managerRole:'Maintenance Manager',site:'Sasti OB',phone:'9000000003'},
  {login:'unassigned-manager',userType:'Super User',adminLevel:'Manager',managerRole:'Maintenance Manager',phone:'9000000004'},
];
function crmHarness({settings=defaultWhatsAppReportSettings(),empty=false,failTemplate=false,failFiles=false,overrides=new Map(),records=null,recipientUsers=users}={}){
  const templates=[],documents=[],texts=[],pdfs=[],queries=[],claims=new Map();let uuid=0;
  const ticketRows=records||[
    {reference:'TIC/1',site:'Sasti OB',openedAt:'2026-09-15T10:00:00+05:30',status:'Open',creatorRole:'Production User'},
    {reference:'TIC/2',site:'Majri OB',openedAt:'2026-09-15T11:00:00+05:30',status:'Open',creatorRole:'MIS User'},
  ];
  const dependencies={siteReportMessageContext,recipientReportMessage,databaseReady:true,storedWhatsAppReportSettings:async()=>settings,whatsappPurposeEnabled,ticketReportWindow,scheduledReportWindowsDue,
    storedHierarchyReportScheduleSettings:async()=>defaultHierarchyReportScheduleSettings(),storedUserReportScheduleOverrides:async()=>overrides,
    reportRecipientLogin:user=>String(user.login||'').toLowerCase(),whatsAppRecipientRole,flowDesignationForUser,applyHierarchyDeliveryRule,applyUserReportScheduleOverride,reportsDueForDesignation,
    hierarchyRuleForDesignation:()=>null,hierarchyRecipientReportScope,canonicalSiteName,buildSiteReportMessage,reportSites,siteReportFilename,timestampInReportWindow,displaySiteName,formatDisplayDateTime,
    pool:{query:async(sql,args=[])=>{
      queries.push({sql,args});
      if(sql.startsWith('INSERT INTO published_reports')&&(typeof failFiles==='function'?failFiles():failFiles))throw new Error('File storage failed');
      if(sql.includes('FROM crm_tickets'))return {rows:empty?[]:ticketRows};
      if(sql.includes("master_name='Users & employees'"))return {rows:recipientUsers.map(record_data=>({record_data}))};
      if(sql.includes("master_name='Equipment master'"))return {rows:['Sasti OB','Majri OB'].map(currentLocation=>({record_data:{currentLocation}}))};
      if(sql.startsWith('INSERT INTO whatsapp_consolidated_report_runs')){
        const key=args.join('|'),previous=claims.get(key);
        if(previous&&(!previous.status.startsWith('Failed')||previous.attempts>=3))return {rows:[],rowCount:0};
        const claim=previous||{id:claims.size+1,slotKey:args[0],login:args[1],scopeKey:args[2],attempts:0};
        claim.status='Sending';claim.attempts++;claims.set(key,claim);return {rows:[{id:claim.id}],rowCount:1};
      }
      if(sql.startsWith('UPDATE whatsapp_consolidated_report_runs')){
        const claim=[...claims.values()].find(item=>item.id===args[1]);assert.ok(claim,'A delivery status needs an existing claim');claim.status=args[0];
      }
      return {rows:[],rowCount:1};
    }},prepareTicketReportRows,buildTicketReportTable,buildTicketWhatsAppReport,resolveMobileAccess,reportScopeIncludesSite,
    publicBaseUrl:()=> 'https://reports.example',randomUUID:()=>String(++uuid).padStart(32,'0').split('').reverse().join(''),
    buildXlsxWorkbookBuffer:(_title,_columns,rows)=>Buffer.from(JSON.stringify(rows)),metaWhatsAppRuntimeEnv:async()=>({WHATSAPP_REPORT_SETTINGS:settings}),
    sendMetaWhatsAppTemplate:async args=>{if(failTemplate)throw Object.assign(new Error('Template unavailable'),{metaCode:failTemplate===true?132001:undefined,code:typeof failTemplate==='string'?failTemplate:undefined});templates.push(args);},
    sendMetaWhatsAppText:async args=>texts.push(args),
    sendMetaWhatsAppDocument:async args=>documents.push(args),
    buildTicketConsolidatedReportPdf:async args=>{pdfs.push(args);return Buffer.from('%PDF');},console:{warn:()=>{},error:()=>{}},
  };
  const groupSnippet=source.slice(source.indexOf('function combineReportWindowGroups('),source.indexOf('let hierarchyReportRunning=false;'));
  const snippet=source.slice(source.indexOf('async function publishCrmReportFiles('),source.indexOf('async function directorReportSourceData'));
  const send=new Function(...Object.keys(dependencies),`${groupSnippet};${snippet};return sendScheduledConsolidatedTicketReports;`)(...Object.values(dependencies));
  return {send,templates,documents,texts,pdfs,queries,claims,settings};
}

test('CRM sends one message per recipient with all selected site files and deduplicates the recipient slot',async()=>{
  const harness=crmHarness();
  assert.equal((await harness.send(now)).sent,3);
  assert.equal(harness.templates.length,3);assert.equal(harness.documents.length,0);
  assert.equal(harness.pdfs.length,2);
  for(const pdf of harness.pdfs){assert.equal(pdf.openTickets.length,1);assert.ok(pdf.openTickets.every(ticket=>ticket.site===pdf.scopeLabel));}
  const manager=harness.templates.filter(message=>message.to==='9000000003');
  assert.equal(manager.length,1);assert.match(manager[0].parameters[0],/^\*LOCATIONS: Sasti OB\*/);assert.doesNotMatch(manager[0].parameters[0],/Majri/);
  const admin=harness.templates.find(message=>message.to==='9000000001');
  assert.match(admin.parameters[0],/^\*LOCATIONS: Majri OB \| Sasti OB\*/);
  assert.match(admin.parameters[0],/\*SITE: Majri OB\*/);assert.match(admin.parameters[0],/\*SITE: Sasti OB\*/);
  for(const message of harness.templates){assert.match(message.parameters[0],/\*PDF - .+:\* https:\/\/reports.example\/r\//);assert.match(message.parameters[0],/Excel - .+:\* https:\/\/reports.example\/r\//);}
  assert.equal(harness.queries.filter(q=>q.sql.startsWith('INSERT INTO published_reports')).length,2);
  assert.equal((await harness.send(now)).sent,0);assert.equal(harness.templates.length,3);
});

test('CRM pauses, recipient selections and empty-site preferences are enforced before sending',async()=>{
  const paused=crmHarness();paused.settings.enabled=false;
  assert.equal((await paused.send(now)).skipped,true);assert.equal(paused.queries.length,0);
  const empty=crmHarness({empty:true});empty.settings.crm.sendEmpty=false;
  assert.equal((await empty.send(now)).sent,0);
  const sendEmpty=crmHarness({empty:true});assert.equal((await sendEmpty.send(now)).sent,3);
  const selected=crmHarness();selected.settings.crm.recipientRoles=['Super Admin'];
  assert.equal((await selected.send(now)).sent,1);assert.ok(selected.templates.every(item=>item.to==='9000000002'));
  const otherTime=crmHarness();otherTime.settings.crm.times=['11:30'];
  assert.equal((await otherTime.send(now)).sent,0);assert.equal(otherTime.templates.length,0);
});

const crmRoleUsers=[...users,
  ...[
    {login:'legacy-project',adminLevel:'Project Manager',site:'Sasti OB'},
    {login:'legacy-project-title',adminLevel:'Admin',designation:'Project Manager',site:'Sasti OB'},
    {login:'admin-department-manager',adminLevel:'Admin',designation:'Maintenance Manager',managerSites:'Majri OB'},
    {login:'implicit-manager',designation:'Production Manager',site:'Sasti OB'},
    {login:'multi-role-manager',adminLevel:'Admin',managerRole:'Project Manager | Production Manager | MIS Manager',site:'Sasti OB'},
    {login:'unassigned-legacy-manager',adminLevel:'Project Manager'},
    {login:'director-admin',adminLevel:'Admin',designation:'Director'},
    {login:'named-director-admin',adminLevel:'Admin',employee:'Rahul Chadda',managerRole:'Production Manager'},
    {login:'director-manager',adminLevel:'Manager',designation:'Director',managerRole:'Production Manager',site:'Majri OB'},
    {login:'titled-super',adminLevel:'Super Admin',designation:'Director',managerRole:'Project Manager'},
    {login:'mobile',userType:'Mobile User',assignedRole:'Production User',site:'Sasti OB'},
  ].map((user,index)=>({userType:'Super User',phone:`90000000${String(index+10).padStart(2,'0')}`,...user})),
];
const crmRoleExpected={
  Admin:['admin','director-admin','named-director-admin'],
  Manager:['manager','legacy-project','legacy-project-title','admin-department-manager','implicit-manager','multi-role-manager','director-manager'],
  'Super Admin':['super','titled-super'],
};

for(const selectedRole of ['Manager','Admin','Super Admin','default']){
  test(`CRM recipient role ${selectedRole} uses manager designations while Directors retain their account category`,async()=>{
    const harness=crmHarness({recipientUsers:crmRoleUsers});
    assert.deepEqual(harness.settings.crm.recipientRoles,['Admin','Manager','Super Admin']);
    if(selectedRole!=='default')harness.settings.crm.recipientRoles=[selectedRole];
    const result=await harness.send(now);
    const delivered=harness.templates.map(message=>({login:crmRoleUsers.find(user=>user.phone===message.to).login,message:message.parameters[0]}));
    const expected=selectedRole==='default'?Object.values(crmRoleExpected).flat():crmRoleExpected[selectedRole];
    assert.deepEqual([...new Set(delivered.map(({login})=>login))].sort(),[...expected].sort());
    assert.equal(result.failed,0);
    for(const login of crmRoleExpected.Manager.filter(login=>expected.includes(login))){
      const messages=delivered.filter(item=>item.login===login);
      assert.equal(messages.length,1,`${login} must retain its assigned site scope`);
      assert.match(messages[0].message,['admin-department-manager','director-manager'].includes(login)?/^\*LOCATIONS: Majri OB\*/:/^\*LOCATIONS: Sasti OB\*/);
    }
    for(const login of [...crmRoleExpected.Admin,...crmRoleExpected['Super Admin']].filter(login=>expected.includes(login))){
      const messages=delivered.filter(item=>item.login===login);
      assert.equal(messages.length,1,`${login} gets both report sites in one message`);
      assert.match(messages[0].message,/\*SITE: Majri OB\*/);assert.match(messages[0].message,/\*SITE: Sasti OB\*/);
    }
    assert.equal(result.sent,delivered.length);
  });
}

test('CRM personal timetable overrides only that recipient and uses previous actual slot',async()=>{
  const schedule={designationKey:'maintenanceManager',enabled:true,schedules:[{key:'personal',cadence:'daily',times:['07:00','15:00','19:00'],reports:['Location wise opened BD']}]};
  const harness=crmHarness({overrides:new Map([['manager',schedule]]),records:[{reference:'EVENING',site:'Sasti OB',openedAt:'2026-09-15T16:00:00+05:30',status:'Open'}]});
  const result=await harness.send(new Date('2026-09-15T19:01:00+05:30'));
  assert.equal(result.sent,1);assert.equal(harness.templates[0].to,'9000000003');
  assert.equal(harness.pdfs[0].start.toISOString(),'2026-09-15T09:30:00.000Z');
  assert.equal(harness.pdfs[0].end.toISOString(),'2026-09-15T13:30:00.000Z');
  const paused=crmHarness({overrides:new Map([['manager',{...schedule,enabled:false}]])});
  assert.equal((await paused.send(new Date('2026-09-15T19:01:00+05:30'))).sent,0);
});

test('CRM fallback delivers both close slots within grace, keeps legacy claim keys and deduplicates repeated polls',async()=>{
  const settings=defaultWhatsAppReportSettings();settings.crm.times=['15:00','15:10'];
  const records=[
    {reference:'BEFORE',site:'Sasti OB',openedAt:'2026-09-15T14:59:59+05:30',status:'Open'},
    {reference:'BOUNDARY',site:'Sasti OB',openedAt:'2026-09-15T15:00:00+05:30',status:'Open'},
    {reference:'AFTER',site:'Sasti OB',openedAt:'2026-09-15T15:09:59+05:30',status:'Open'},
    {reference:'NEXT',site:'Sasti OB',openedAt:'2026-09-15T15:10:00+05:30',status:'Open'},
  ];
  const harness=crmHarness({settings,records,recipientUsers:[users[2]]});
  const first=await harness.send(new Date('2026-09-15T15:15:00+05:30'));
  assert.equal(first.sent,2);assert.equal(first.failed,0);
  assert.deepEqual(harness.pdfs.map(({start,end,openTickets})=>({start:start.toISOString(),end:end.toISOString(),tickets:openTickets.map(ticket=>ticket.reference)})),[
    {start:'2026-09-14T09:40:00.000Z',end:'2026-09-15T09:30:00.000Z',tickets:['BEFORE']},
    {start:'2026-09-15T09:30:00.000Z',end:'2026-09-15T09:40:00.000Z',tickets:['BOUNDARY','AFTER']},
  ]);
  assert.deepEqual([...harness.claims.values()].map(({slotKey,status,attempts})=>({slotKey,status,attempts})),[
    {slotKey:'CRM-2026-09-15-15',status:'Sent',attempts:1},
    {slotKey:'CRM-2026-09-15-1510',status:'Sent',attempts:1},
  ]);
  assert.equal((await harness.send(new Date('2026-09-15T15:16:00+05:30'))).sent,0);
  assert.equal((await harness.send(new Date('2026-09-15T15:31:00+05:30'))).sent,0);
  assert.equal(harness.templates.length,2);assert.equal(harness.pdfs.length,2);
  assert.ok([...harness.claims.values()].every(claim=>claim.attempts===1));
});

test('CRM fallback retries a failed earlier slot while the successful adjacent slot stays deduplicated',async()=>{
  const settings=defaultWhatsAppReportSettings();settings.crm.times=['15:00','15:10'];
  let publicationAttempts=0;
  const harness=crmHarness({settings,recipientUsers:[users[2]],failFiles:()=>++publicationAttempts===1});
  const first=await harness.send(new Date('2026-09-15T15:15:00+05:30'));
  assert.equal(first.failed,1);assert.equal(first.sent,1);
  const [earlier,later]=[...harness.claims.values()];
  assert.equal(earlier.slotKey,'CRM-2026-09-15-15');assert.match(earlier.status,/^Failed - File storage failed/);
  assert.equal(later.slotKey,'CRM-2026-09-15-1510');assert.equal(later.status,'Sent');
  const retry=await harness.send(new Date('2026-09-15T15:16:00+05:30'));
  assert.equal(retry.sent,1);assert.equal(retry.failed,0);
  assert.equal(earlier.status,'Sent');assert.equal(earlier.attempts,2);
  assert.equal(later.status,'Sent');assert.equal(later.attempts,1);
  assert.equal(publicationAttempts,3);
  assert.equal((await harness.send(new Date('2026-09-15T15:17:00+05:30'))).sent,0);
  assert.equal(harness.templates.length,2);
  assert.equal(publicationAttempts,3);
});

test('CRM includes raised-and-resolved cases and reconstructs resolution at the window boundary',async()=>{
  const records=[
    {reference:'BOTH',site:'Sasti OB',openedAt:'2026-09-15T09:00:00+05:30',resolvedAt:'2026-09-15T11:00:00+05:30',status:'Resolved'},
    {reference:'LATER',site:'Sasti OB',openedAt:'2026-09-15T10:00:00+05:30',resolvedAt:'2026-09-15T16:00:00+05:30',status:'Resolved'},
    {reference:'OLD',site:'Sasti OB',openedAt:'2026-09-14T10:00:00+05:30',status:'Open'},
    {reference:'BOUNDARY',site:'Sasti OB',openedAt:'2026-09-15T15:00:00+05:30',status:'Open'},
  ];
  const harness=crmHarness({records});await harness.send(now);
  const pdf=harness.pdfs.find(item=>item.scopeLabel==='Sasti OB');
  assert.deepEqual(pdf.openTickets.map(item=>item.reference),['LATER']);
  assert.deepEqual(pdf.closedTickets.map(item=>item.reference),['BOTH']);
});

test('CRM fallback still sends one message per recipient and never retries an uncertain response',async()=>{
  const fallback=crmHarness({failTemplate:true});assert.equal((await fallback.send(now)).sent,3);assert.equal(fallback.documents.length,1);assert.equal(fallback.texts.length,2);
  assert.ok(fallback.documents.every(item=>/\*Excel - .+:\* https:\/\/reports.example\/r\//.test(item.caption)));
  for(const text of fallback.texts){assert.match(text.message,/SITE: Sasti OB/);assert.match(text.message,/SITE: Majri OB/);}
  for(const code of ['WHATSAPP_POLICY_PAUSED','network']){
    const paused=crmHarness({failTemplate:code});assert.equal((await paused.send(now)).failed,3);assert.equal(paused.documents.length,0);assert.equal(paused.texts.length,0);
  }
  const failed=crmHarness({failFiles:true});assert.equal((await failed.send(now)).failed,3);assert.equal(failed.templates.length,0);assert.equal(failed.documents.length,0);
});

test('failure to publish the second site sends no partial message and retries the complete recipient delivery',async()=>{
  let writes=0;
  const harness=crmHarness({recipientUsers:[users[0]],failFiles:()=>++writes===2});
  const first=await harness.send(now);
  assert.equal(first.failed,1);assert.equal(first.sent,0);assert.equal(harness.templates.length,0);
  assert.equal(harness.claims.size,1);
  const retry=await harness.send(new Date(now.getTime()+60000));
  assert.equal(retry.sent,1);assert.equal(retry.failed,0);assert.equal(harness.templates.length,1);
  assert.match(harness.templates[0].parameters[0],/\*SITE: Majri OB\*/);
  assert.match(harness.templates[0].parameters[0],/\*SITE: Sasti OB\*/);
  assert.equal([...harness.claims.values()][0].attempts,2);
  assert.equal((await harness.send(new Date(now.getTime()+120000))).sent,0);
  assert.equal(harness.templates.length,1);
});
