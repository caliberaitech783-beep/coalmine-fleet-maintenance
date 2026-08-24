import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');

test('workflow notifications are mirrored to Meta WhatsApp recipients',()=>{
  assert.match(server,/async function sendWhatsAppNotifications/);
  assert.match(server,/Nerve Center notification/);
  assert.match(server,/await sendWhatsAppNotifications\(client,logins,reference,message,workflowTemplate\)/);
  assert.match(server,/await sendWhatsAppNotifications\(pool,newRecipients,request\.reference,message,/);
  assert.match(server,/await addTicketNotifications\(pool,recipients,rows\[0\]\.ref,`Request \$\{rows\[0\]\.ref\} was verified by/);
  assert.match(server,/\['System notification',String\(reference\|\|''\)/);
  for(const key of ['ticketCreated','ticketResolved','maintenanceReminder','dailyUpdate','requestOpened','requestIdle','requestClosed','requestOnRoad','requestVerified'])assert.match(server,new RegExp(`templateKey:'${key}'`));
  assert.match(server,/catch\(templateError\)[\s\S]*sendMetaWhatsAppText/);
  assert.match(server,/const requestSite=canonicalSiteName\(site\)/);
  assert.match(server,/const userSite=canonicalSiteName\(user\.site\|\|user\.location\|\|user\.currentLocation\)/);
});
