import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');

test('all server WhatsApp delivery is paused until the hierarchy is configured',()=>{
  assert.match(server,/const WHATSAPP_DELIVERY_PAUSED=true;/);
  assert.match(server,/META_WHATSAPP_DELIVERY_PAUSED:String\(WHATSAPP_DELIVERY_PAUSED\)/);
  assert.match(server,/return \{\.\.\.process\.env,META_WHATSAPP_DELIVERY_PAUSED:String\(WHATSAPP_DELIVERY_PAUSED\)\}/);
});

test('new request WhatsApp alerts are immediate while unrelated notification policies remain unchanged',()=>{
  assert.match(server,/async function addTicketNotifications\(client,recipients,reference,message,workflowTemplate,\{whatsapp=true\}=\{\}\)/);
  assert.match(server,/if\(whatsapp\)await sendWhatsAppNotifications/);
  assert.match(server,/templateKey:'requestOpened'[^\n]*\{whatsapp:true\}/);
  assert.match(server,/templateKey:'requestClosed'[\s\S]*\{whatsapp:false\}/);
  assert.match(server,/templateKey:'requestVerified'[\s\S]*\{whatsapp:false\}/);
  assert.match(server,/templateKey:'ticketCreated'[\s\S]*\{whatsapp:false\}/);
  assert.match(server,/templateKey:'ticketResolved'[\s\S]*\{whatsapp:false\}/);
  assert.match(server,/sendScheduledConsolidatedTicketReports/);
  assert.match(server,/WhatsApp request traffic is[\s\S]*scheduled consolidated report/);
  assert.match(server,/async function sendScheduledConsolidatedWhatsAppReports/);
  assert.match(server,/whatsapp_consolidated_report_runs/);
  assert.match(server,/templateKey:'consolidatedRequestReport'/);
  assert.match(server,/sendScheduledConsolidatedWhatsAppReports[\s\S]*const isAdmin=profile\.permissions\.adminLevel==='Admin';[\s\S]*if\(!isAdmin&&!isManager\)continue;/);
  assert.match(server,/sendScheduledConsolidatedWhatsAppReports[\s\S]*if\(isAdmin&&scope\.sites!==null&&!scope\.sites\.length\)scope=\{key:'ALL',label:'All regions',sites:null\};/);
  assert.match(server,/setInterval\(\(\)=>\{[\s\S]*sendScheduledConsolidatedWhatsAppReports/);
});

test('Super Admin request traffic is excluded even when a duplicate Admin login exists',()=>{
  assert.match(server,/const superAdminLogins=new Set/);
  assert.match(server,/requestTemplate&&superAdminLogins\.has\(login\)/);
  assert.match(server,/eligibleLogins=requestTemplate\?logins\.filter/);
});
