import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaultWhatsAppReportSettings} from '../whatsapp-report-settings.mjs';

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');

test('server WhatsApp delivery is enabled through the shared runtime switch',()=>{
  assert.equal(defaultWhatsAppReportSettings().enabled,true);
  assert.match(server,/setWhatsAppDeliveryPolicyReader\(storedWhatsAppReportSettings\)/);
  assert.match(server,/META_WHATSAPP_DELIVERY_PAUSED:String\(!reportSettings.enabled\)/);
  assert.match(server,/return \{\.\.\.process\.env,META_WHATSAPP_DELIVERY_PAUSED:'true'\}/);
});

test('new request WhatsApp alerts are immediate while unrelated notification policies remain unchanged',()=>{
  assert.match(server,/async function addTicketNotifications\(client,recipients,reference,message,workflowTemplate,\{whatsapp=true,whatsappRecipients=null,workflowType='',site=''\}=\{\}\)/);
  assert.match(server,/if\(whatsapp\)await sendWhatsAppNotifications/);
  assert.match(server,/templateKey:'requestOpened'[\s\S]*\{whatsapp:true,whatsappRecipients,workflowType:'opened'/);
  assert.match(server,/templateKey:'requestClosed'[\s\S]*\{whatsapp:true,whatsappRecipients,workflowType:'closed'/);
  assert.match(server,/templateKey:'requestVerified'[\s\S]*\{whatsapp:true,whatsappRecipients,workflowType:'verified'/);
  assert.match(server,/templateKey:'requestIdle'[\s\S]*\{whatsapp:true,whatsappRecipients,workflowType:'idle'/);
  for(const purpose of ['ticketCreated','ticketResolved','dailyUpdate']){
    assert.equal(defaultWhatsAppReportSettings().channels[purpose],false);
    assert.match(server,new RegExp(`templateKey:'${purpose}'[^;]+\\{whatsapp:true\\}`));
  }
  assert.match(server,/sendScheduledConsolidatedTicketReports/);
  assert.match(server,/WhatsApp request traffic is[\s\S]*scheduled consolidated report/);
  assert.match(server,/async function sendScheduledConsolidatedWhatsAppReports/);
  assert.match(server,/whatsapp_consolidated_report_runs/);
  assert.match(server,/templateKey:'consolidatedRequestReport'/);
  assert.match(server,/sendScheduledConsolidatedWhatsAppReports[\s\S]*const isAdmin=profile\.permissions\.adminLevel==='Admin';[\s\S]*if\(!isAdmin&&!isManager\)continue;/);
  assert.match(server,/sendScheduledConsolidatedWhatsAppReports[\s\S]*if\(isAdmin&&scope\.sites!==null&&!scope\.sites\.length\)scope=\{key:'ALL',label:'All regions',sites:null\};/);
  assert.match(server,/setInterval\(\(\)=>\{[\s\S]*sendScheduledConsolidatedWhatsAppReports/);
});

test('legacy request traffic without a configured workflow still excludes Super Admin logins',()=>{
  assert.match(server,/const superAdminLogins=new Set/);
  assert.match(server,/requestTemplate&&!workflowType&&superAdminLogins\.has\(login\)/);
  assert.match(server,/eligibleLogins=workflowType\?\[\.\.\.usersByLogin.keys\(\)\]:requestTemplate\?logins\.filter/);
});

test('workflow WhatsApp recipients are independently selected and rechecked at delivery',()=>{
  assert.match(server,/requestWorkflowWhatsAppLogins/);
  assert.match(server,/workflowWhatsAppRecipientLogins\(rows,\{eventType,site,settings:await storedWhatsAppReportSettings\(\)\}\)/);
  assert.match(server,/const workflowExcludedLogins=new Set/);
  assert.match(server,/if\(workflowExcludedLogins\.has\(login\)\)continue/);
  assert.match(server,/if\(workflowType&&!isWorkflowWhatsAppRecipient\(user,workflowType,site,reportSettings\)\)continue/);
  assert.match(server,/whatsappRecipients\?\?logins/);
});

test('workbook escalation and repeat intervals use a deduplicated scheduler',()=>{
  assert.match(server,/CREATE TABLE IF NOT EXISTS whatsapp_workflow_dispatches/);
  assert.match(server,/UNIQUE\(event_type,request_reference,recipient_login,slot_key\)/);
  assert.match(server,/async function sendScheduledWorkflowWhatsAppReminders/);
  assert.match(server,/started_at<=\$1::timestamptz-\(\$2::int\*INTERVAL '1 hour'\)/);
  assert.match(server,/ideal_requested_at<=\$1::timestamptz-\(\$3::int\*INTERVAL '1 hour'\)/);
  assert.match(server,/workflowReminderSlot\(eventType,eventTime,now,reportSettings\)/);
  assert.match(server,/ON CONFLICT DO NOTHING RETURNING id/);
  assert.match(server,/const workflowReminderTimer=setInterval/);
});
