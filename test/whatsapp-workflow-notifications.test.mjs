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

test('request alerts and daily updates use the shared immediate notification path with generic defaults enabled',()=>{
  assert.match(server,/async function addTicketNotifications\(client,recipients,reference,message,workflowTemplate,\{whatsapp=true,whatsappRecipients=null,workflowType='',site=''\}=\{\}\)/);
  // The audience is still chosen the same way; only the wait moved off the reply.
  assert.match(server,/if\(whatsapp\)deferWhatsAppNotifications\(logins,reference,message,workflowTemplate,\{workflowType,site,whatsappRecipients\}\);/);
  assert.match(server,/setImmediate\(\(\)=>\{[\s\S]*?await genericWhatsAppAlertLogins[\s\S]*?await sendWhatsAppNotifications/);
  assert.match(server,/templateKey:'requestOpened'[\s\S]*\{whatsapp:true,whatsappRecipients,workflowType:'opened'/);
  assert.match(server,/templateKey:'requestClosed'[\s\S]*\{whatsapp:true,whatsappRecipients,workflowType:'closed'/);
  assert.match(server,/templateKey:'requestVerified'[\s\S]*\{whatsapp:true,whatsappRecipients,workflowType:'verified'/);
  assert.match(server,/templateKey:'requestIdle'[\s\S]*\{whatsapp:true,whatsappRecipients,workflowType:'idle'/);
  for(const purpose of ['ticketCreated','ticketResolved','dailyUpdate']){
    assert.equal(defaultWhatsAppReportSettings().channels[purpose],true);
  }
  assert.match(server,/templateKey:'dailyUpdate'[^;]+\{whatsapp:true,site:/);
});

test('CRM routes commit in-app notifications and respond before starting WhatsApp asynchronously',()=>{
  for(const [start,end,purpose] of [
    ["app.post('/api/tickets',","app.patch('/api/tickets/resolve',",'ticketCreated'],
    ["app.patch('/api/tickets/resolve',",'async function createMaintenanceReminderNotifications(', 'ticketResolved'],
  ]){
    const route=server.slice(server.indexOf(start),server.indexOf(end));
    assert.match(route,new RegExp(`templateKey:'${purpose}'[^;]+\\{whatsapp:false\\}`));
    const write=route.indexOf('await addTicketNotifications('),commit=route.indexOf("await client.query('COMMIT');",write);
    const response=route.indexOf(purpose==='ticketCreated'?'res.status(201).json(':'res.json(ticket);',commit);
    const followUp=route.indexOf('void sendGenericWhatsAppAlertBestEffort(',response);
    assert.ok(write>=0&&commit>write&&response>commit&&followUp>response,purpose);
  }
});

test('scheduled consolidated reporting remains registered independently of immediate alerts',()=>{
  assert.match(server,/sendScheduledConsolidatedTicketReports/);
  assert.match(server,/async function sendScheduledConsolidatedWhatsAppReports/);
  assert.match(server,/whatsapp_consolidated_report_runs/);
  assert.match(server,/templateKey:'consolidatedRequestReport'/);
  assert.match(server,/setStaggeredInterval\(\(\)=>\{[\s\S]*sendScheduledConsolidatedWhatsAppReports/);
});

test('the sender excludes reports-only logins and has no legacy blanket Super Admin exclusion',()=>{
  const sender=server.slice(server.indexOf('async function sendWhatsAppNotifications('),server.indexOf('async function genericWhatsAppAlertLogins('));
  assert.match(sender,/isWhatsAppReportsOnlyRecipient\(user\)/);
  assert.match(sender,/reportsOnlyLogins\.has\(login\)/);
  assert.match(sender,/const eligibleLogins=\[\.\.\.usersByLogin.keys\(\)\]/);
  assert.doesNotMatch(sender,/superAdminLogins|isTrueSuperAdmin/);
});

test('workflow WhatsApp recipients are independently selected and rechecked at delivery',()=>{
  assert.match(server,/requestWorkflowWhatsAppLogins/);
  assert.match(server,/workflowWhatsAppRecipientLogins\(rows,\{eventType,site,settings:ignoreSwitches\?routingReportSettings\(settings\):settings\}\)/);
  assert.match(server,/const settings=await storedWhatsAppReportSettings\(\);\s*return workflowWhatsAppRecipientLogins/);
  assert.match(server,/const workflowExcludedLogins=new Set/);
  assert.match(server,/if\(workflowExcludedLogins\.has\(login\)\|\|reportsOnlyLogins\.has\(login\)\)continue/);
  assert.match(server,/if\(workflowType&&!isWorkflowWhatsAppRecipient\(user,workflowType,site,routingSettings\)\)continue/);
  assert.match(server,/const routingSettings=routingReportSettings\(reportSettings\);/);
  assert.match(server,/function routingReportSettings\(settings\)\{\s*return \{\.\.\.settings,enabled:true,/);
  assert.match(server,/whatsappRecipients\?\?logins/);
});

test('on-road closure sends a dedicated first-trip pending notice to the production team',()=>{
  assert.match(server,/async function productionFirstTripNotificationLogins/);
  assert.match(server,/profile\.assignedRole==='Production User'/);
  assert.match(server,/managerRoles\.includes\('Production Manager'\)/);
  assert.match(server,/async function notifyProductionFirstTripPending/);
  assert.match(server,/Production team must record the first trip\/work start entry/);
  assert.match(server,/sendWhatsAppNotifications\(pool,recipients,request\.ref,message,null,\{site:request\.site,purpose:'requestClosed'\}\)/);
  assert.match(server,/await notifyProductionFirstTripPending\(rows\[0\],closedAt,closedBy\)/);
  assert.match(server,/await notifyProductionFirstTripPending\(rows\[0\],new Date\(\),req\.session\.name\|\|'Project \/ Production Manager'\)/);
});

test('workbook escalation and repeat intervals use a deduplicated scheduler',()=>{
  assert.match(server,/CREATE TABLE IF NOT EXISTS whatsapp_workflow_dispatches/);
  assert.match(server,/UNIQUE\(event_type,request_reference,recipient_login,slot_key\)/);
  assert.match(server,/async function sendScheduledWorkflowWhatsAppReminders/);
  assert.match(server,/started_at<=\$1::timestamptz-\(\$2::int\*INTERVAL '1 hour'\)/);
  assert.match(server,/ideal_requested_at<=\$1::timestamptz-\(\$3::int\*INTERVAL '1 hour'\)/);
  assert.match(server,/workflowReminderSlot\(eventType,eventTime,now,slotSettings\)/);
  assert.match(server,/const slotSettings=whatsappReminder\?reportSettings:/);
  assert.match(server,/ON CONFLICT DO NOTHING RETURNING id/);
  assert.match(server,/const workflowReminderTimer=setStaggeredInterval/);
});
