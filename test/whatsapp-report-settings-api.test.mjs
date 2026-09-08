import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {registerWhatsAppReportSettingsApi,reportTemplateState} from '../whatsapp-report-settings-api.mjs';
import {defaultWhatsAppReportSettings} from '../whatsapp-report-settings.mjs';
import {candidateReportTemplate} from '../whatsapp-template-runtime.mjs';
import {SINGLE_REPORT_TEMPLATE_PURPOSES} from '../whatsapp-template-catalog.mjs';

async function harness(t){
  const app=express();app.use(express.json());
  let settings=defaultWhatsAppReportSettings(),revision=null,authorization={session:{role:'super',permissions:{adminLevel:'Admin'}}};
  let writes=0,syncs=0;const audits=[];
  app.use((req,res,next)=>{res.on('finish',()=>{if(req.audit)audits.push(req.audit);});next();});
  const read=async()=>({settings,revision,templateState:reportTemplateState(settings,{})});
  registerWhatsAppReportSettingsApi(app,{
    requireSession:(req,res,next)=>{if(!req.get('Authorization'))return res.status(401).json({error:'Sign in required'});req.session={role:'super',permissions:{adminLevel:'Super Admin'}};next();},
    authorize:async()=>authorization,read,
    save:async(value,provided)=>{if(provided!==revision)throw Object.assign(new Error('Reload before saving.'),{status:409});settings=value;revision=`revision-${++writes}`;},
    syncTemplates:async()=>{syncs++;},
  });
  app.use((error,_req,res,_next)=>res.status(500).json({error:error.message}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const request=(path='',init={})=>fetch(`http://127.0.0.1:${server.address().port}/api/report-settings${path}`,{...init,headers:{Authorization:'Bearer fixture','Content-Type':'application/json',...init.headers}});
  return {request,read,audits,role:value=>{authorization=value;},counts:()=>({writes,syncs})};
}

test('Report settings endpoints require a current administrator, even with an old Super Admin session',async t=>{
  const api=await harness(t);
  assert.equal((await api.request('',{headers:{Authorization:''}})).status,401);
  for(const authorization of [null,{session:{role:'normal',permissions:{adminLevel:'Admin'}}},{session:{role:'super',permissions:{adminLevel:'Manager'}}}]){
    api.role(authorization);
    assert.equal((await api.request()).status,403);
    assert.equal((await api.request('',{method:'PUT',body:JSON.stringify({})})).status,403);
    assert.equal((await api.request('/templates',{method:'POST',body:JSON.stringify({action:'submit'})})).status,403);
  }
  assert.deepEqual(api.counts(),{writes:0,syncs:0});
  api.role({session:{role:'super',permissions:{adminLevel:'Super Admin'}}});
  const result=await api.request();assert.equal(result.status,200);assert.match(result.headers.get('cache-control'),/no-store/);
});

test('saving validated settings persists choices, strips unknown fields and rejects a stale revision',async t=>{
  const api=await harness(t),initial=await (await api.request()).json();
  initial.settings.enabled=false;initial.settings.reminders.offRoad.hours=8;
  initial.settings.accessToken='must-not-be-saved';initial.settings.approvals={spoofed:{status:'APPROVED'}};
  const saved=await api.request('',{method:'PUT',body:JSON.stringify(initial)});
  assert.equal(saved.status,200);
  const value=await saved.json();assert.equal(value.settings.enabled,false);assert.equal(value.settings.reminders.offRoad.hours,8);
  assert.equal(value.settings.accessToken,undefined);assert.equal(value.settings.approvals,undefined);
  const stale=await api.request('',{method:'PUT',body:JSON.stringify(initial)});
  assert.equal(stale.status,409);assert.equal(api.counts().writes,1);
  assert.equal(api.audits[0].action,'Save WhatsApp report settings');
});

test('invalid settings and custom wording are rejected, and provider actions are explicit',async t=>{
  const api=await harness(t),initial=await api.read();
  initial.settings.templates.requestOpened={variant:'custom',body:'Missing all fields.'};
  assert.equal((await api.request('',{method:'PUT',body:JSON.stringify(initial)})).status,400);
  assert.equal((await api.request('/templates',{method:'POST',body:JSON.stringify({action:'send-message'})})).status,400);
  assert.deepEqual(api.counts(),{writes:0,syncs:0});
  for(const action of ['submit','refresh'])assert.equal((await api.request('/templates',{method:'POST',body:JSON.stringify({action})})).status,200);
  assert.equal(api.counts().syncs,2);
});

test('template status distinguishes requested wording from the template actually used',()=>{
  const settings=defaultWhatsAppReportSettings();settings.templates.idleReminder.variant='detailed';
  const candidate=candidateReportTemplate('idleReminder',settings.templates.idleReminder);
  let state=reportTemplateState(settings,{[candidate.name]:{status:'PENDING',checkedAt:'2026-09-08T10:00:00Z'}}).idleReminder;
  assert.equal(state.usingRequested,false);assert.equal(state.name,candidate.name);assert.equal(state.effectiveName,'bdms_vehicle_idle_v1');
  state=reportTemplateState(settings,{[candidate.name]:{status:'APPROVED'}}).idleReminder;
  assert.equal(state.usingRequested,true);
});

test('new library samples and independent single-report choices persist through the settings API',async t=>{
  const api=await harness(t),initial=await (await api.request()).json();
  const [first,second]=SINGLE_REPORT_TEMPLATE_PURPOSES;
  initial.settings.templates.consolidatedRequestReport={variant:'executive',body:''};
  initial.settings.templates[first.key]={variant:'checklist',body:''};
  initial.settings.templates.ticketResolved={variant:'formal',body:''};
  const response=await api.request('',{method:'PUT',body:JSON.stringify(initial)});
  assert.equal(response.status,200);
  const saved=await (await api.request()).json();
  assert.equal(saved.settings.templates[first.key].variant,'checklist');
  assert.equal(saved.settings.templates[second.key].variant,'inherit');
  assert.equal(saved.settings.templates.consolidatedRequestReport.variant,'executive');
  assert.equal(saved.settings.templates.ticketResolved.variant,'formal');
  assert.equal(saved.templateState[first.key].usingRequested,false);
  assert.equal(saved.templateState[second.key].name,saved.templateState.consolidatedRequestReport.name);
});
