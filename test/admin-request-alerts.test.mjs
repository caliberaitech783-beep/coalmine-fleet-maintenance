import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isRequestAlertSuppressedUser,isRequestLifecycleAlert} from '../whatsapp-recipient-policy.mjs';
import {resolveMobileAccess} from '../mobile-access.mjs';
import {userSiteScope,reportScopeIncludesSite} from '../region-scope.mjs';
import {canonicalSiteName} from '../site-location.mjs';

const server=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
test('admin group blocks request lifecycle and reminder messages, including untyped request alerts',async()=>{
  const source=server.slice(server.indexOf('async function deliverToTelegramGroup('),server.indexOf('// Admin and Super Admin users'));
  const deliver=new Function('isRequestLifecycleAlert',`${source};return deliverToTelegramGroup;`)(isRequestLifecycleAlert);
  for(const purpose of ['requestOpened','requestAccepted','requestClosed','requestVerified','requestIdle','offRoadEscalation','idleReminder','dailyUpdate']){
    assert.equal(await deliver({purpose,target:'legacy-reference'}),'Skipped - admin request alerts disabled');
  }
  assert.equal(await deliver({reportType:'System notification',target:'REQ-123'}),'Skipped - admin request alerts disabled');
  for(const purpose of ['ticketCreated','ticketResolved','consolidatedRequestReport','manualReports'])assert.equal(isRequestLifecycleAlert({purpose,target:'report'}),false);
});

test('in-app request audience excludes admins and directors even as requesters or duplicate operational logins',async()=>{
  const users=[
    {login:'admin',userType:'Super User',adminLevel:'Admin'},
    {login:'super',userType:'Super User',adminLevel:'Super Admin'},
    {login:'director',userType:'Super User',adminLevel:'Manager',designation:'Director'},
    {login:'director-name',userType:'Super User',adminLevel:'Manager',employee:'Mohit Chadda'},
    {login:'worker',userType:'Mobile User',assignedRole:'Maintenance User',site:'Sasti OB'},
    {login:'admin',userType:'Mobile User',assignedRole:'Maintenance User',site:'Sasti OB'},
    {login:'manager',userType:'Super User',adminLevel:'Manager',managerRole:'Maintenance Manager',site:'Sasti OB'},
  ];
  const source=server.slice(server.indexOf('async function requestStakeholderLogins('),server.indexOf('async function productionFirstTripNotificationLogins('));
  const select=new Function('isRequestAlertSuppressedUser','resolveMobileAccess','canonicalSiteName','userSiteScope','reportScopeIncludesSite','userManagesSite',`${source};return requestStakeholderLogins;`)(isRequestAlertSuppressedUser,resolveMobileAccess,canonicalSiteName,userSiteScope,reportScopeIncludesSite,()=>true);
  const client={query:async()=>({rows:users.map(record_data=>({record_data}))})};
  for(const requesterLogin of ['admin','super','director','director-name'])assert.deepEqual(await select(client,{site:'Sasti OB',requesterLogin}),['worker','manager']);
});

test('scheduled request reminders never send to the shared admin group',()=>{
  const source=server.slice(server.indexOf('async function sendScheduledWorkflowWhatsAppReminders('),server.indexOf("app.get('/api/info-pulse'"));
  assert.doesNotMatch(source,/deliverToTelegramGroup|TELEGRAM_GROUP_LOGIN|if\(!whatsappReminder\)continue/);
  assert.match(source,/requestWorkflowWhatsAppLogins/);
  assert.match(source,/request.ref,login,slotKey/);
  assert.match(source,/telegramGroup:false/);
  assert.match(server,/if\(isRequestAlertSuppressedUser\(user,profile\)\)continue/);
});
