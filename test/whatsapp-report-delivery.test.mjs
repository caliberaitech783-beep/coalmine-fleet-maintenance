import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultWhatsAppReportSettings,whatsappPurposeEnabled} from '../whatsapp-report-settings.mjs';
import {ticketReportWindow,ticketReportDue,prepareTicketReportRows,buildTicketReportTable,buildTicketWhatsAppReport} from '../ticket-consolidated-report.mjs';
import {resolveMobileAccess} from '../mobile-access.mjs';
import {managerReportScope,reportScopeIncludesSite} from '../region-scope.mjs';
import {isWorkflowWhatsAppRecipient,isExcludedWorkflowWhatsAppRecipient} from '../whatsapp-workflow-policy.mjs';
import {reportTemplateFallback} from '../whatsapp-template-runtime.mjs';

const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const now=new Date('2026-09-08T15:00:00+05:30');
const users=[
  {login:'admin',userType:'Super User',adminLevel:'Admin',phone:'9000000001'},
  {login:'super',userType:'Super User',adminLevel:'Super Admin',phone:'9000000002'},
  {login:'manager',userType:'Super User',adminLevel:'Manager',managerRole:'Maintenance Manager',site:'Sasti OB',phone:'9000000003'},
  {login:'unassigned-manager',userType:'Super User',adminLevel:'Manager',managerRole:'Maintenance Manager',phone:'9000000004'},
];

function crmHarness({settings=defaultWhatsAppReportSettings(),empty=false,failTemplate=false,failFiles=false}={}){
  const templates=[],documents=[],pdfs=[],queries=[],claims=new Set();
  let uuid=0;
  const dependencies={databaseReady:true,storedWhatsAppReportSettings:async()=>settings,whatsappPurposeEnabled,ticketReportDue,ticketReportWindow,
    pool:{query:async(sql,args=[])=>{
      queries.push({sql,args});
      if(sql.startsWith('INSERT INTO published_reports')&&failFiles)throw new Error('File storage failed');
      if(sql.includes('FROM crm_tickets'))return {rows:empty?[]:[{reference:'TIC/1',site:'Sasti OB',openedAt:'2026-09-08T05:00:00Z',status:'Open'},{reference:'TIC/2',site:'Majri OB',openedAt:'2026-09-08T05:00:00Z',status:'Open'}]};
      if(sql.includes("master_name='Users & employees'"))return {rows:users.map(record_data=>({record_data}))};
      if(sql.startsWith('INSERT INTO whatsapp_consolidated_report_runs')){const key=args.join('|');if(claims.has(key))return {rows:[],rowCount:0};claims.add(key);return {rows:[{id:claims.size}],rowCount:1};}
      return {rows:[],rowCount:1};
    }},prepareTicketReportRows,buildTicketReportTable,buildTicketWhatsAppReport,resolveMobileAccess,managerReportScope,reportScopeIncludesSite,
    publicBaseUrl:()=> 'https://reports.example',randomUUID:()=>String(++uuid).padStart(32,'0').split('').reverse().join(''),
    buildXlsxWorkbookBuffer:(_title,_columns,rows)=>Buffer.from(JSON.stringify(rows)),
    reportDateTime:value=>value.toISOString(),reportFilename:()=> 'CRM.pdf',metaWhatsAppRuntimeEnv:async()=>({WHATSAPP_REPORT_SETTINGS:settings}),
    sendMetaWhatsAppTemplate:async args=>{if(failTemplate)throw Object.assign(new Error('Template unavailable'),{code:typeof failTemplate==='string'?failTemplate:undefined});templates.push(args);},
    sendMetaWhatsAppDocument:async args=>{documents.push(args);},
    buildTicketConsolidatedReportPdf:async args=>{pdfs.push(args);return Buffer.from('%PDF');},console:{warn:()=>{},error:()=>{}},
  };
  const snippet=source.slice(source.indexOf('async function publishCrmReportFiles('),source.indexOf('async function directorReportSourceData'));
  const send=new Function(...Object.keys(dependencies),`${snippet};return sendScheduledConsolidatedTicketReports;`)(...Object.values(dependencies));
  return {send,templates,documents,pdfs,queries,settings};
}

test('CRM always publishes scoped PDF and Excel links, including legacy formats, and deduplicates the slot',async()=>{
  for(const format of ['links','both','summary','pdf']){
    const harness=crmHarness();harness.settings.crm.format=format;
    assert.equal((await harness.send(now)).sent,2);
    assert.equal(harness.templates.length,2);
    assert.equal(harness.documents.length,0);
    assert.equal(harness.pdfs[0].openTickets.length,2);assert.equal(harness.pdfs[1].openTickets.length,1);
    for(const message of harness.templates.map(item=>item.parameters[0])){
      assert.match(message,/PDF: https:\/\/reports.example\/r\//);assert.match(message,/Excel: https:\/\/reports.example\/r\//);
      assert.doesNotMatch(message,/TIC\/1|TIC\/2/);
    }
    const files=harness.queries.filter(q=>q.sql.startsWith('INSERT INTO published_reports'));
    assert.equal(files.length,2);
    assert.match(files[0].sql,/14 days/);
    assert.equal(JSON.parse(files[0].args[7]).length,2);
    assert.equal(JSON.parse(files[1].args[7]).length,1);
    assert.notEqual(files[0].args[1],files[1].args[1]);
    await harness.send(now);
    assert.equal(harness.templates.length,2);
  }
});

test('CRM master pause, empty-report preference and selected account types affect actual dispatch',async()=>{
  const paused=crmHarness();paused.settings.enabled=false;
  assert.equal((await paused.send(now)).skipped,true);assert.equal(paused.queries.length,0);
  const empty=crmHarness({empty:true});empty.settings.crm.sendEmpty=false;
  assert.equal((await empty.send(now)).sent,0);assert.equal(empty.documents.length,0);
  const selected=crmHarness();selected.settings.crm.recipientRoles=['Super Admin'];
  assert.equal((await selected.send(now)).sent,1);assert.equal(selected.templates[0].to,'9000000002');
  const otherTime=crmHarness();otherTime.settings.crm.times=['11:30'];
  assert.equal((await otherTime.send(now)).skipped,true);assert.equal(otherTime.queries.length,0);
});

test('CRM falls back to the PDF with both file links when its template is unavailable',async()=>{
  const settings=defaultWhatsAppReportSettings();settings.crm.format='summary';
  const harness=crmHarness({settings,failTemplate:true});
  const result=await harness.send(now);assert.equal(result.sent,2);assert.equal(harness.documents.length,2);
  assert.match(harness.documents[0].caption,/Excel: https:\/\/reports.example\/r\//);
  assert.equal(harness.documents[0].purpose,'consolidatedTicketReport');
});

test('CRM never sends a summary or marks success if file publishing fails',async()=>{
  const harness=crmHarness({failFiles:true});
  assert.equal((await harness.send(now)).failed,2);
  assert.equal(harness.templates.length,0);assert.equal(harness.documents.length,0);
});

test('pausing CRM delivery during publication does not trigger the document fallback',async()=>{
  const harness=crmHarness({failTemplate:'WHATSAPP_POLICY_PAUSED'});
  assert.equal((await harness.send(now)).failed,2);
  assert.equal(harness.templates.length,0);assert.equal(harness.documents.length,0);
});

test('direct notification sender rechecks saved event roles and optional channel switches',async()=>{
  const settings=defaultWhatsAppReportSettings(),sent=[];
  const pool={query:async(sql,args=[])=>({rows:sql.includes("master_name='Users & employees'")?users.filter(user=>args[0].includes(user.login)).map(record_data=>({record_data})):[]})};
  const dependencies={storedWhatsAppReportSettings:async()=>settings,whatsappPurposeEnabled,pool,resolveMobileAccess,isExcludedWorkflowWhatsAppRecipient,isWorkflowWhatsAppRecipient,
    isTrueSuperAdmin:user=>user.adminLevel==='Super Admin',metaWhatsAppRuntimeEnv:async()=>({WHATSAPP_REPORT_SETTINGS:settings}),
    sendMetaWhatsAppTemplate:async args=>sent.push(args),sendMetaWhatsAppText:async args=>sent.push(args),reportTemplateFallback,console:{error:()=>{}},
  };
  const snippet=source.slice(source.indexOf('async function sendWhatsAppNotifications('),source.indexOf('async function addTicketNotifications('));
  const send=new Function(...Object.keys(dependencies),`${snippet};return sendWhatsAppNotifications;`)(...Object.values(dependencies));
  const logins=users.map(user=>user.login),event={templateKey:'requestOpened',parameters:[]};
  await send(pool,logins,'REQ/1','Opened',event,{workflowType:'opened',site:'Sasti OB'});
  assert.deepEqual(sent.map(item=>item.to),['9000000003']);
  settings.events.opened.recipientRoles=['superAdmin'];sent.length=0;
  await send(pool,logins,'REQ/1','Opened',event,{workflowType:'opened',site:'Sasti OB'});
  assert.deepEqual(sent.map(item=>item.to),['9000000002']);
  sent.length=0;
  await send(pool,['admin'],'TIC/1','Created',{templateKey:'ticketCreated',parameters:[]});assert.equal(sent.length,0);
  settings.channels.ticketCreated=true;
  await send(pool,['admin'],'TIC/1','Created',{templateKey:'ticketCreated',parameters:[]});assert.equal(sent.length,1);
  settings.enabled=false;sent.length=0;
  await send(pool,logins,'REQ/1','Opened',event,{workflowType:'opened',site:'Sasti OB'});assert.equal(sent.length,0);
});
