import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');

test('request WhatsApp alerts are consolidated while in-app notifications remain immediate',()=>{
  assert.match(server,/async function addTicketNotifications\(client,recipients,reference,message,workflowTemplate,\{whatsapp=true\}=\{\}\)/);
  assert.match(server,/if\(whatsapp\)await sendWhatsAppNotifications/);
  assert.match(server,/templateKey:'requestOpened'[\s\S]*\{whatsapp:false\}/);
  assert.match(server,/templateKey:'requestClosed'[\s\S]*\{whatsapp:false\}/);
  assert.match(server,/templateKey:'requestVerified'[\s\S]*\{whatsapp:false\}/);
  assert.match(server,/WhatsApp request traffic is[\s\S]*scheduled consolidated report/);
  assert.match(server,/async function sendScheduledConsolidatedWhatsAppReports/);
  assert.match(server,/whatsapp_consolidated_report_runs/);
  assert.match(server,/templateKey:'consolidatedRequestReport'/);
  assert.match(server,/setInterval\(\(\)=>\{[\s\S]*sendScheduledConsolidatedWhatsAppReports/);
});
