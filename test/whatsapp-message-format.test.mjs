import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {META_WORKFLOW_TEMPLATES,LEGACY_WORKFLOW_TEMPLATES,reportTemplateChoices,validateCustomTemplate,baseTemplateKey} from '../whatsapp-template-catalog.mjs';
import {whatsAppMessageParameters,renderWhatsAppTemplate,siteReportMessageContext,whatsAppNextStep} from '../whatsapp-message-format.mjs';
import {sendMetaWhatsAppTemplate,setWhatsAppDeliveryPolicyReader} from '../meta-whatsapp.mjs';
import {defaultWhatsAppReportSettings} from '../whatsapp-report-settings.mjs';
import {reportTemplateFallback,candidateReportTemplate} from '../whatsapp-template-runtime.mjs';

const request={site:'Sasti OB',ref:'REQ_42',equipmentGroup:'TIPPERS',door:'V_12',reg:'MH12 AB1234',chassis:'CH_987',
  category:'Aggregate Repair',complaint:'Hydraulic pump leaking',maintenanceWork:'Pump replaced and tested',delayedReason:'Awaiting spare pump',
  idealRequestedBy:'Maintenance Operator',firstTripDone:true,firstTripAt:'2026-09-15 06:50:00',closingMeterReadings:{HMR:'1532',KMR:'30555'},expectedCompletionAt:'2026-09-15 07:00:00'};
const user=role=>({userType:'Mobile User',assignedRole:role,site:'Sasti OB'});
const env={META_WHATSAPP_ACCESS_TOKEN:'test-token',META_WHATSAPP_PHONE_NUMBER_ID:'123'};
const render=(purpose,context,parameters=LEGACY_WORKFLOW_TEMPLATES[baseTemplateKey(purpose)].example)=>renderWhatsAppTemplate(META_WORKFLOW_TEMPLATES[purpose],whatsAppMessageParameters(purpose,parameters,context));

test('each event renders the saved site, breakdown and relevant reason/work on separate labelled lines',()=>{
  for(const purpose of ['requestOpened','requestClosed','requestVerified','requestIdle','offRoadEscalation','idleReminder']){
    const message=render(purpose,{request,recipient:user('Maintenance User')});
    assert.ok(message.startsWith('*SITE: Sasti OB*\n'),purpose);
    assert.match(message,/\*Breakdown type:\* Aggregate Repair\n/);
    assert.match(message,/\*Complaint \/ reason:\* Hydraulic pump leaking\n/);
    assert.match(message,/Door: V_12/);assert.match(message,/Chassis: CH_987/);
    assert.doesNotMatch(message,/undefined|null|Hydraulic hose leaking/);
    if(!['requestOpened','offRoadEscalation'].includes(purpose))assert.match(message,/\*Work completed:\* Pump replaced and tested/);
  }
  assert.match(render('requestClosed',{request}),/\*Delay reason:\* Awaiting spare pump/);
  assert.match(render('requestVerified',{request}),/\*Closing meter:\* HMR 1532 \| KMR 30555/);
  assert.match(render('requestVerified',{request}),/\*First trip:\* Completed at 15-09-2026 06:50:00 AM IST/);
  assert.match(render('requestVerified',{request:{...request,firstTripDone:false}}),/\*First trip:\* Pending/);
  assert.match(render('requestIdle',{request}),/\*Marked by:\* Maintenance Operator/);
  assert.match(render('offRoadEscalation',{request}),/\| Off Road Escalation\*/);
  assert.match(render('idleReminder',{request}),/\| Idle Reminder\*/);
});

test('role-aware next steps give Maintenance repair work, MIS verification and Production coordination',()=>{
  const messages=['Production User','Maintenance User','MIS User'].map(role=>render('requestOpened',{request,recipient:user(role)}));
  assert.match(messages[0],/coordinate equipment availability/);
  assert.match(messages[1],/diagnose the complaint/);
  assert.match(messages[2],/verification follows maintenance closure/);
  assert.match(whatsAppNextStep('requestClosed',user('MIS User')),/Verify the closure/);
  assert.match(whatsAppNextStep('ticketCreated',{userType:'Super User',adminLevel:'Admin'}),/record the resolution/);
  assert.match(whatsAppNextStep('ticketCreated',user('Production User')),/Your ticket is recorded/);
});

test('CRM creation and resolution include the actual site, category, priority, issue and resolution',()=>{
  const ticket={site:'Majri OB',category:'Production',priority:'High',message:'No operator available',resolutionMessage:'Operator assigned',createdAt:'2026-09-15 06:00',resolvedAt:'2026-09-15 07:10'};
  for(const purpose of ['ticketCreated','ticketResolved']){
    const message=render(purpose,{ticket,url:'https://bdms.cmll.in/',recipient:user('Production User')});
    assert.ok(message.startsWith('*SITE: Majri OB*\n'));
    assert.match(message,/\*Category:\* Production/);assert.match(message,/\*Priority:\* High/);
    assert.match(message,/\*Issue \/ reason:\* No operator available/);
    if(purpose==='ticketResolved'){
      assert.match(message,/\*Resolution:\* Operator assigned/);
      assert.match(message,/15-09-2026 07:10:00 AM/);
    }
  }
});

test('maintenance updates contain progress, delay, equipment, ETC and a real timestamp',()=>{
  const message=render('dailyUpdate',{request,remark:'Pump fitting in progress',delayReason:'Crane unavailable',updatedAt:new Date('2026-09-15T01:30:00Z'),url:'https://bdms.cmll.in/?request=REQ_42'});
  for(const text of ['*SITE: Sasti OB*','*Maintenance update:* Pump fitting in progress','*Delay reason:* Crane unavailable','*Expected completion (IST):* 15-09-2026 07:00:00 AM','*Updated at (IST):* 15-09-2026 07:00:00 AM','?request=REQ_42'])assert.ok(message.includes(text),text);
});

test('audio-only complaints and missing values are explicit and long free text retains the request link',()=>{
  const audio=render('requestOpened',{request:{...request,complaint:'',complaintAudio:'data:audio/webm;base64,private'}});
  assert.match(audio,/Audio recorded/);assert.doesNotMatch(audio,/data:audio/);
  const long=render('requestClosed',{request:{...request,complaint:'Very long complaint '.repeat(1000),maintenanceWork:'Work '.repeat(1000)}});
  assert.ok(long.length<4096);assert.match(long,/…/);assert.ok(long.includes(LEGACY_WORKFLOW_TEMPLATES.requestClosed.example.at(-1)));
  assert.match(render('requestOpened',{}),/\*Complaint \/ reason:\* Not recorded/);
});

test('provider payload keeps site first, structured lines static, full site PDF/Excel links and overnight period',async()=>{
  const report=siteReportMessageContext({site:'Sasti OB',window:{start:new Date('2026-09-14T19:00:00+05:30'),end:new Date('2026-09-15T07:00:00+05:30')},count:7,pdfUrl:'https://example.com/site_pdf?a=b_c',xlsxUrl:'https://example.com/site_xlsx'});
  let payload;
  await sendMetaWhatsAppTemplate({to:'9000000000',templateKey:'consolidatedRequestReport',parameters:['old summary'],context:{report}},{env,fetchImpl:async(_url,options)=>{payload=JSON.parse(options.body);return {ok:true,json:async()=>({messages:[{id:'test'}]})};}});
  const parameters=payload.template.components[0].parameters.map(p=>p.text);
  assert.equal(parameters[0],'Sasti OB');assert.equal(parameters[4],report.pdfUrl);assert.equal(parameters[5],report.xlsxUrl);
  assert.ok(parameters.every(value=>!/[\r\n\t]/.test(value)));
  const message=renderWhatsAppTemplate(META_WORKFLOW_TEMPLATES.consolidatedRequestReport,parameters);
  assert.match(message,/^\*SITE: Sasti OB\*\n/);assert.match(message,/14-09-2026 07:00:00 PM to 15-09-2026 07:00:00 AM/);
  assert.match(message,/\n\*PDF \/ files:\* https:/);assert.match(message,/\n\*Excel \/ other files:\* https:/);
  assert.doesNotMatch(message,/old summary|Majri/);
});

test('every prepared style and valid custom wording preserves a bold first-line site',()=>{
  for(const purpose of ['requestOpened','requestClosed','requestVerified','requestIdle','ticketCreated','ticketResolved','dailyUpdate','consolidatedRequestReport','consolidatedTicketReport','manualReports','offRoadEscalation','idleReminder']){
    for(const choice of reportTemplateChoices(purpose)){
      assert.equal(validateCustomTemplate(purpose,choice.body),'',`${purpose}/${choice.variant}`);
      assert.ok(choice.body.startsWith('*SITE: {{1}}*\n'));
    }
  }
  const body=reportTemplateChoices('requestClosed')[2].body;
  assert.match(validateCustomTemplate('requestClosed',body.replace('*SITE: {{1}}*','Site: {{1}}')),/highlighted/);
  // Old custom text stays stored but cannot map old field numbers to new data.
  assert.equal(candidateReportTemplate('ticketResolved',{variant:'custom',body:LEGACY_WORKFLOW_TEMPLATES.ticketResolved.body}).name,META_WORKFLOW_TEMPLATES.ticketResolved.name);
});

test('text fallback includes the same saved record and role-specific next step',()=>{
  const purpose='requestClosed',context={request,recipient:user('MIS User')};
  const text=reportTemplateFallback(purpose,LEGACY_WORKFLOW_TEMPLATES[purpose].example,defaultWhatsAppReportSettings(),{},'old short notification',context);
  assert.equal(text,render(purpose,context));
  assert.match(text,/Awaiting spare pump/);assert.match(text,/Verify the closure/);
});

test('new templates use their new schema; explicit unavailable response alone allows a legacy delivery',async()=>{
  const calls=[],parameters=['TIC/1','Admin'];
  const result=await sendMetaWhatsAppTemplate({to:'9000000000',templateKey:'ticketResolved',parameters,context:{ticket:{site:'Sasti OB'}}},{env,fetchImpl:async(_url,options)=>{
    calls.push(JSON.parse(options.body));return calls.length===1?{ok:false,status:400,json:async()=>({error:{code:132001,message:'Template unavailable'}})}:{ok:true,json:async()=>({messages:[{id:'legacy-sent'}]})};
  }});
  assert.equal(calls.length,2);assert.equal(result.layoutPending,true);
  assert.equal(calls[0].template.name,META_WORKFLOW_TEMPLATES.ticketResolved.name);
  assert.equal(calls[0].template.components[0].parameters.length,10);
  assert.equal(calls[1].template.name,LEGACY_WORKFLOW_TEMPLATES.ticketResolved.name);
  assert.deepEqual(calls[1].template.components[0].parameters.map(p=>p.text),parameters);
});

test('provider suspension, timeouts and a pause during migration never trigger a second template send',async()=>{
  for(const code of [132015,132016,131026,'network','pause']){
    let calls=0;const settings=defaultWhatsAppReportSettings();setWhatsAppDeliveryPolicyReader(async()=>settings);
    try{
      await assert.rejects(()=>sendMetaWhatsAppTemplate({to:'9000000000',templateKey:'ticketResolved',parameters:['TIC/1','Admin']},{env,fetchImpl:async()=>{
        calls++;if(code==='network')throw new Error('Connection lost');if(code==='pause')settings.enabled=false;
        return {ok:false,status:400,json:async()=>({error:{code:code==='pause'?132001:code,message:'Unavailable'}})};
      }}));
      assert.equal(calls,1,String(code));
    }finally{setWhatsAppDeliveryPolicyReader(null);}
  }
});

test('saved records are attached at every event call site including reminders and daily updates',()=>{
  const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const eventCalls=source.split('\n').filter(line=>line.includes("{templateKey:'request")&&line.includes('parameters:'));
  assert.equal(eventCalls.length,7);
  for(const line of eventCalls)assert.match(line,/context:\{request(?::rows\[0\])?\}/);
  assert.match(source,/templateKey:'dailyUpdate'[^\n]*context:\{request:eligible.rows\[0\],remark,delayReason/);
  assert.match(source,/recipient:usersByLogin.get\(login\)/);
  assert.match(source,/site:siteAccess\|\|'All permitted sites'/);
});
