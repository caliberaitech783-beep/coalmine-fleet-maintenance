import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultWhatsAppReportSettings,normalizeWhatsAppReportSettings,PURPOSE_OPTIONS,whatsappSettingsValidationError,whatsappPurposeEnabled} from '../whatsapp-report-settings.mjs';
import {META_WORKFLOW_TEMPLATES,reportTemplateChoices,validateCustomTemplate,previewReportTemplate,isSingleReportPurpose,SINGLE_REPORT_TEMPLATE_PURPOSES,hierarchyReportMessagePurpose} from '../whatsapp-template-catalog.mjs';
import {candidateReportTemplate,effectiveReportTemplate,reportTemplateFallback,requestedReportTemplate} from '../whatsapp-template-runtime.mjs';
import {DIRECTOR_REPORT_TITLES} from '../director-report-bundle.mjs';
import {workflowWhatsAppRecipientLogins,workflowReminderSlot} from '../whatsapp-workflow-policy.mjs';
import {ticketReportWindow,ticketReportDue} from '../ticket-consolidated-report.mjs';
import {sendMetaWhatsAppTemplate,sendMetaWhatsAppText,sendMetaWhatsAppDocument,setWhatsAppDeliveryPolicyReader,metaWhatsAppTemplateStatuses,submitMetaWhatsAppTemplates} from '../meta-whatsapp.mjs';

test('an absent settings record preserves current delivery defaults',()=>{
  const settings=normalizeWhatsAppReportSettings();
  assert.equal(whatsappSettingsValidationError(settings),'');
  assert.equal(settings.enabled,true);
  assert.deepEqual(settings.events.opened.recipientRoles,['maintenanceSupervisor','maintenanceManager','productionManager']);
  assert.deepEqual(settings.events.closed.recipientRoles,['productionSupervisor','productionManager','maintenanceManager']);
  assert.deepEqual(settings.events.verified.recipientRoles,['productionManager','maintenanceManager','misManager']);
  assert.deepEqual(settings.events.idle.recipientRoles,['projectManager','productionManager','maintenanceManager','misManager']);
  assert.deepEqual(settings.reminders,{offRoad:{enabled:true,hours:4},idle:{enabled:true,hours:1}});
  assert.deepEqual(settings.crm,{enabled:true,days:[0,1,2,3,4,5,6],times:['08:00','15:00','20:00'],recipientRoles:['Admin','Manager'],sendEmpty:true,format:'both'});
  assert.deepEqual(settings.channels,{hierarchyReports:true,ticketCreated:false,ticketResolved:false,dailyUpdate:false,passwordResetOtp:true,manualReports:true});
  assert.equal(settings.quietHours.enabled,false);
  for(const [key,value] of Object.entries(settings.templates))assert.equal(value.variant,isSingleReportPurpose(key)?'inherit':'standard');
});

test('invalid role, interval, schedule, switch and template inputs are rejected before saving',()=>{
  for(const mutate of [
    s=>s.enabled='false',s=>s.events.opened.recipientRoles=['everyone'],s=>s.reminders.offRoad.hours=0,
    s=>s.reminders.idle.hours=25,s=>s.crm.times=['25:00'],s=>s.crm.times=[],s=>s.crm.days=[],
    s=>s.crm.recipientRoles=[],s=>s.crm.sendEmpty='false',s=>s.channels.manualReports=null,
    s=>s.quietHours={enabled:true,start:'22:00',end:'22:00'},s=>s.templates.requestOpened.variant='unknown',
  ]){const settings=defaultWhatsAppReportSettings();mutate(settings);assert.ok(whatsappSettingsValidationError(settings));}
  const disabled=defaultWhatsAppReportSettings();disabled.crm={...disabled.crm,enabled:false,times:[],days:[],recipientRoles:[]};
  assert.equal(whatsappSettingsValidationError(disabled),'');
  assert.equal(normalizeWhatsAppReportSettings({enabled:'false',accessToken:'secret'}).accessToken,undefined);
});

test('master, purpose and quiet-hour switches compose without an OTP bypass of the master',()=>{
  const settings=defaultWhatsAppReportSettings(),night=new Date('2026-09-08T18:30:00Z'),morning=new Date('2026-09-09T01:30:00Z');
  settings.quietHours.enabled=true;
  for(const {key} of PURPOSE_OPTIONS)assert.equal(whatsappPurposeEnabled(settings,key,night),false);
  assert.equal(whatsappPurposeEnabled(settings,'passwordResetOtp',night),true);
  assert.equal(whatsappPurposeEnabled(settings,'requestOpened',morning),true);
  settings.channels.passwordResetOtp=false;
  assert.equal(whatsappPurposeEnabled(settings,'passwordResetOtp',night),false);
  settings.channels.passwordResetOtp=true;settings.enabled=false;
  assert.equal(whatsappPurposeEnabled(settings,'passwordResetOtp',night),false);
  assert.equal(whatsappPurposeEnabled(settings,'unknown',morning),false);
  settings.enabled=true;settings.events.opened.enabled=false;
  assert.equal(whatsappPurposeEnabled(settings,'offRoadEscalation',morning),false);
  settings.events.opened.enabled=true;settings.reminders.offRoad.enabled=false;
  assert.equal(whatsappPurposeEnabled(settings,'offRoadEscalation',morning),false);
  assert.equal(whatsappPurposeEnabled(settings,'requestOpened',morning),true);
  settings.channels.hierarchyReports=false;
  assert.equal(whatsappPurposeEnabled(settings,'consolidatedRequestReport',morning),false);
  assert.equal(whatsappPurposeEnabled(settings,'manualReports',morning),true);
});

test('changing selected roles changes direct recipients while retaining site and duplicate-login checks',()=>{
  const users=[
    {login:'maintenance',userType:'Mobile User',assignedRole:'Maintenance User',site:'Sasti OB'},
    {login:'production',userType:'Mobile User',assignedRole:'Production User',site:'Sasti OB'},
    {login:'other-site',userType:'Mobile User',assignedRole:'Production User',site:'Majri OB'},
    {login:'admin',userType:'Super User',adminLevel:'Admin'},
    {login:'super',userType:'Super User',adminLevel:'Super Admin'},
    {login:'manager',userType:'Super User',adminLevel:'Manager',managerRole:'Production Manager',site:'Sasti OB'},
  ];
  const settings=defaultWhatsAppReportSettings();
  const recipients=()=>workflowWhatsAppRecipientLogins(users,{eventType:'opened',site:'Sasti OB',settings});
  assert.deepEqual(recipients(),['maintenance','manager']);
  settings.events.opened.recipientRoles=['productionSupervisor','admin','superAdmin'];
  assert.deepEqual(recipients(),['production','admin','super']);
  settings.events.opened.recipientRoles=['productionSupervisor'];
  users.push({login:'production',userType:'Super User',adminLevel:'Super Admin',site:'Sasti OB'});
  assert.deepEqual(recipients(),[]);
  settings.events.opened.enabled=false;assert.deepEqual(recipients(),[]);
});

test('configured reminder intervals produce stable deduplication slots and can be paused separately',()=>{
  const settings=defaultWhatsAppReportSettings(),start=new Date('2026-09-08T00:00:00Z');
  const at=hours=>new Date(start.getTime()+hours*3600000);
  settings.reminders.offRoad.hours=6;settings.reminders.idle.hours=3;
  assert.equal(workflowReminderSlot('opened',start,at(5.99),settings),'');
  assert.equal(workflowReminderSlot('opened',start,at(6),settings),'offroad-hour-6');
  assert.equal(workflowReminderSlot('opened',start,at(20),settings),'offroad-hour-6');
  assert.equal(workflowReminderSlot('idle',start,at(2.99),settings),'');
  assert.equal(workflowReminderSlot('idle',start,at(3),settings),'idle-hour-3');
  assert.equal(workflowReminderSlot('idle',start,at(5),settings),'idle-hour-3');
  assert.equal(workflowReminderSlot('idle',start,at(6),settings),'idle-hour-6');
  settings.reminders.idle.enabled=false;
  assert.equal(workflowReminderSlot('idle',start,at(20),settings),'');
});

test('CRM schedule respects custom minutes, weekdays and the previous actual delivery slot',()=>{
  const settings={days:[1,5],times:['09:15','17:45']};
  const monday=new Date('2026-09-07T09:15:00+05:30');
  const window=ticketReportWindow(monday,settings);
  assert.equal(window.slotKey,'CRM-2026-09-07-0915');
  assert.equal(window.start.toISOString(),new Date('2026-09-04T17:45:00+05:30').toISOString());
  assert.equal(ticketReportDue(monday,20,settings),true);
  assert.equal(ticketReportDue(new Date('2026-09-07T09:36:00+05:30'),20,settings),false);
  assert.equal(ticketReportDue(new Date('2026-09-08T09:15:00+05:30'),20,settings),false);
  assert.equal(ticketReportWindow(new Date('2026-09-08T08:00:00+05:30')).slotKey,'CRM-2026-09-08-08');
  assert.equal(ticketReportWindow(monday,{days:[],times:[]}),null);
  const weekly=ticketReportWindow(monday,{days:[1],times:['09:15']});
  assert.equal(weekly.start.toISOString(),new Date('2026-08-31T09:15:00+05:30').toISOString());
});

test('every prepared template retains all required fields and has a readable populated preview',()=>{
  for(const {key} of PURPOSE_OPTIONS){
    const choices=reportTemplateChoices(key);assert.equal(choices.length,10);
    assert.equal(new Set(choices.map(choice=>choice.body)).size,10,`${key} must contain ten distinct samples`);
    for(const choice of choices){
      if(choice.variant!=='standard')assert.equal(validateCustomTemplate(key,choice.body),'',`${key}: ${choice.variant}`);
      assert.ok(choice.body.length<=1024);
      assert.doesNotMatch(previewReportTemplate(key,choice.body),/\{\{|\}\}/);
    }
  }
  const body=reportTemplateChoices('ticketResolved')[2].body;
  assert.match(validateCustomTemplate('ticketResolved',body.replace('{{2}}','')),/every required/);
  assert.match(validateCustomTemplate('ticketResolved',body+' {{7}}'),/numbered placeholders/);
  assert.match(validateCustomTemplate('ticketResolved',body+' again {{1}}.'),/once/);
});

test('all ten samples for every purpose survive settings validation and become real provider candidates',()=>{
  for(const {key} of PURPOSE_OPTIONS)for(const choice of reportTemplateChoices(key)){
    const settings=defaultWhatsAppReportSettings();settings.templates[key]={variant:choice.variant,body:''};
    assert.equal(whatsappSettingsValidationError(settings),'',`${key}/${choice.variant}`);
    const normalized=normalizeWhatsAppReportSettings(settings);
    assert.equal(normalized.templates[key].variant,choice.variant);
    assert.equal(requestedReportTemplate(key,normalized).body,choice.body);
    if(choice.variant!=='standard')assert.notEqual(requestedReportTemplate(key,normalized).name,META_WORKFLOW_TEMPLATES[isSingleReportPurpose(key)?'consolidatedRequestReport':key]?.name);
  }
});

test('every named report has ten samples, and single-report routing does not split consolidated bundles',()=>{
  assert.deepEqual(SINGLE_REPORT_TEMPLATE_PURPOSES.map(report=>report.reportTitle),[...new Set(DIRECTOR_REPORT_TITLES)]);
  assert.equal(new Set(SINGLE_REPORT_TEMPLATE_PURPOSES.map(report=>report.key)).size,SINGLE_REPORT_TEMPLATE_PURPOSES.length);
  for(const report of SINGLE_REPORT_TEMPLATE_PURPOSES){
    assert.equal(hierarchyReportMessagePurpose([report.reportTitle]),report.key);
    assert.equal(reportTemplateChoices(report.key).length,10);
    assert.match(previewReportTemplate(report.key,'Report: {{1}}.'),new RegExp(report.reportTitle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }
  assert.equal(hierarchyReportMessagePurpose(DIRECTOR_REPORT_TITLES),'consolidatedRequestReport');
  assert.equal(hierarchyReportMessagePurpose(['Unknown report']),'consolidatedRequestReport');
  assert.equal(hierarchyReportMessagePurpose([]),'consolidatedRequestReport');
});

test('single reports inherit saved bundle wording and approval until an individual override is chosen',()=>{
  const settings=defaultWhatsAppReportSettings(),key=SINGLE_REPORT_TEMPLATE_PURPOSES[0].key;
  settings.templates.consolidatedRequestReport={variant:'brief',body:''};
  const bundle=requestedReportTemplate('consolidatedRequestReport',settings),approvals={[bundle.name]:{status:'APPROVED'}};
  assert.equal(requestedReportTemplate(key,settings).name,bundle.name);
  assert.equal(effectiveReportTemplate(key,settings,approvals).name,bundle.name);
  settings.templates[key]={variant:'executive',body:''};
  const override=requestedReportTemplate(key,settings);
  assert.notEqual(override.name,bundle.name);
  assert.equal(effectiveReportTemplate(key,settings,approvals).name,META_WORKFLOW_TEMPLATES.consolidatedRequestReport.name);
  approvals[override.name]={status:'APPROVED'};
  assert.equal(effectiveReportTemplate(key,settings,approvals).name,override.name);
  assert.equal(requestedReportTemplate('consolidatedRequestReport',settings).name,bundle.name);
  settings.channels.hierarchyReports=false;
  assert.equal(whatsappPurposeEnabled(settings,key),false);
  assert.equal(whatsappPurposeEnabled(settings,'manualReports'),true);
});

test('legacy template definitions and their approved variant names are retained',()=>{
  const settings=defaultWhatsAppReportSettings();
  for(const key of ['requestOpened','requestClosed','requestVerified','requestIdle','consolidatedRequestReport','consolidatedTicketReport','ticketCreated','ticketResolved','dailyUpdate']){
    assert.equal(requestedReportTemplate(key,settings).name,META_WORKFLOW_TEMPLATES[key].name);
  }
  const existingNames={
    'requestOpened/brief':'bdms_requestopened_42f567e9cbf0881b',
    'requestOpened/detailed':'bdms_requestopened_d0767942fddd0caf',
    'consolidatedRequestReport/brief':'bdms_consolidatedrequestreport_d636075b8700c887',
    'consolidatedRequestReport/detailed':'bdms_consolidatedrequestreport_e79a43a5eb31aa20',
    'manualReports/brief':'bdms_manualreports_1706bce8511bd63d',
    'manualReports/detailed':'bdms_manualreports_ab8c5bd16537a660',
  };
  for(const [sample,name] of Object.entries(existingNames)){
    const [purpose,variant]=sample.split('/');assert.equal(candidateReportTemplate(purpose,{variant}).name,name);
  }
  const legacy={...settings,templates:{consolidatedRequestReport:{variant:'detailed',body:''}}};
  const normalized=normalizeWhatsAppReportSettings(legacy);
  assert.equal(requestedReportTemplate(SINGLE_REPORT_TEMPLATE_PURPOSES[0].key,normalized).name,requestedReportTemplate('consolidatedRequestReport',legacy).name);
});

test('template choice activates only after server-held approval and uses a content-derived name',()=>{
  const settings=defaultWhatsAppReportSettings(),purpose='requestOpened';
  settings.templates[purpose]={variant:'detailed',body:''};
  const candidate=candidateReportTemplate(purpose,settings.templates[purpose]);
  assert.match(candidate.name,/^bdms_requestopened_[0-9a-f]{16}$/);
  for(const status of ['PENDING','REJECTED','PAUSED']){
    assert.equal(effectiveReportTemplate(purpose,settings,{[candidate.name]:{status}}).name,META_WORKFLOW_TEMPLATES.requestOpened.name);
  }
  const approvals={[candidate.name]:{status:'APPROVED'}};
  assert.equal(effectiveReportTemplate(purpose,settings,approvals).name,candidate.name);
  assert.equal(candidateReportTemplate(purpose,settings.templates[purpose]).name,candidate.name);
  settings.templates[purpose]={variant:'custom',body:candidate.body+' Please review.'};
  assert.notEqual(candidateReportTemplate(purpose,settings.templates[purpose]).name,candidate.name);
  assert.equal(effectiveReportTemplate(purpose,settings,approvals).name,META_WORKFLOW_TEMPLATES.requestOpened.name);
  assert.match(reportTemplateFallback(purpose,META_WORKFLOW_TEMPLATES.requestOpened.example,settings,approvals,'old fallback'),/^BDMS Off Road Alert/);
});

const deliveryEnv={META_WHATSAPP_ACCESS_TOKEN:'test-token',META_WHATSAPP_PHONE_NUMBER_ID:'123',META_WHATSAPP_BUSINESS_ACCOUNT_ID:'456'};
const response=details=>({ok:true,json:async()=>details});

test('all delivery transports consult the persisted master before making requests, including OTPs',async()=>{
  const settings=defaultWhatsAppReportSettings();settings.enabled=false;
  let requests=0;const options={env:deliveryEnv,fetchImpl:async()=>{requests++;return response({});}};
  setWhatsAppDeliveryPolicyReader(async()=>settings);
  try{
    for(const action of [
      ()=>sendMetaWhatsAppText({to:'9000000000',message:'Test'},options),
      ()=>sendMetaWhatsAppTemplate({to:'9000000000',templateKey:'passwordResetOtp',parameters:['123456']},options),
      ()=>sendMetaWhatsAppDocument({to:'9000000000',buffer:Buffer.from('test')},options),
    ])await assert.rejects(action,{code:'WHATSAPP_POLICY_PAUSED'});
    assert.equal(requests,0);
  }finally{setWhatsAppDeliveryPolicyReader(null);}
});

test('saving a pause during PDF upload prevents the subsequent message send',async()=>{
  const settings=defaultWhatsAppReportSettings(),requests=[];
  setWhatsAppDeliveryPolicyReader(async()=>settings);
  try{
    await assert.rejects(()=>sendMetaWhatsAppDocument({to:'9000000000',purpose:'consolidatedTicketReport',buffer:Buffer.from('%PDF')},{env:deliveryEnv,fetchImpl:async url=>{
      requests.push(url);settings.enabled=false;return response({id:'media'});
    }}),{code:'WHATSAPP_POLICY_PAUSED'});
    assert.equal(requests.length,1);assert.match(requests[0],/\/media$/);
  }finally{setWhatsAppDeliveryPolicyReader(null);}
});

test('template transport uses an approved selected purpose, and text fallback respects channel pauses',async()=>{
  const settings=defaultWhatsAppReportSettings();settings.channels.ticketResolved=true;settings.templates.ticketResolved.variant='brief';
  const selected=candidateReportTemplate('ticketResolved',settings.templates.ticketResolved),requests=[];
  const env={...deliveryEnv,WHATSAPP_REPORT_SETTINGS:settings,WHATSAPP_TEMPLATE_APPROVALS:{[selected.name]:{status:'APPROVED'}}};
  await sendMetaWhatsAppTemplate({to:'9000000000',templateKey:'ticketResolved',parameters:['TIC/1','Admin']},{env,fetchImpl:async(_url,options)=>{requests.push(JSON.parse(options.body));return response({messages:[{id:'test'}]});}});
  assert.equal(requests[0].template.name,selected.name);
  settings.channels.ticketResolved=false;
  await assert.rejects(()=>sendMetaWhatsAppText({to:'9000000000',purpose:'ticketResolved',message:'fallback'},{env}),{code:'WHATSAPP_POLICY_PAUSED'});
});

test('provider template status follows pagination and submissions contain only selected candidates',async()=>{
  const candidate=candidateReportTemplate('requestOpened',{variant:'brief'}),templates={selected:candidate},requests=[];
  const statuses=await metaWhatsAppTemplateStatuses({env:deliveryEnv,templates,fetchImpl:async(url)=>{
    requests.push(url);return response(url.includes('&after=')?{data:[{name:candidate.name,status:'APPROVED',language:'en_US'}]}:{data:[{name:'unrelated',status:'APPROVED'}],paging:{next:'next-page',cursors:{after:'cursor'}}});
  }});
  assert.equal(requests.length,2);assert.equal(statuses.length,1);assert.equal(statuses[0].name,candidate.name);
  const submitted=[];
  await submitMetaWhatsAppTemplates({env:deliveryEnv,templates,fetchImpl:async(_url,options)=>{
    if(options.method==='GET')return response({data:[]});
    submitted.push(JSON.parse(options.body));return response({id:'test',status:'PENDING'});
  }});
  assert.equal(submitted.length,1);assert.equal(submitted[0].name,candidate.name);
  assert.equal(submitted[0].components[0].text,candidate.body);
});
