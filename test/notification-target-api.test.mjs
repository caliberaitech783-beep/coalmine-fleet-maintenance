import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const start=server.indexOf("app.get('/api/notifications/:id/target'");
const end=server.indexOf("app.patch('/api/notifications/read'",start);
const route=server.slice(start,end);

test('notification target lookup requires an owned numeric notification and never parses its message',()=>{
  assert.ok(start>=0&&end>start,'notification target route should exist before the read acknowledgement route');
  assert.match(route,/requireSession/);
  assert.match(route,/\^\[1-9\]\\d\*\$/);
  assert.match(route,/FROM crm_notifications WHERE id=\$1 AND recipient_login=\$2/);
  assert.match(route,/String\(req\.session\.login\|\|''\)\.trim\(\)\.toLowerCase\(\)/);
  assert.match(route,/SELECT ticket_reference AS reference/);
  assert.doesNotMatch(route,/notification[^\n]*\.message|SELECT[^\n]*message/);
});

test('notification targets are exact, uncached, and unavailable through one generic response',()=>{
  assert.match(route,/private, no-store, no-cache, must-revalidate/);
  assert.match(route,/\.vary\('Authorization'\)/);
  assert.match(route,/FROM crm_tickets WHERE reference=\$1/);
  assert.match(route,/FROM maintenance_requests WHERE reference=\$1/);
  assert.match(route,/ticketResult\.rows\.length&&requestResult\.rows\.length/);
  assert.match(route,/const unavailable=\(\)=>res\.status\(404\)\.json\(\{error:'Notification target is not available\.'\}\)/);
  assert.doesNotMatch(route,/res\.status\((?:401|403|410)\)/);
});

test('ticket target visibility matches creator, Manager role and site, or Admin access',()=>{
  assert.match(route,/req\.session\.role==='super'&&req\.session\.permissions\?\.adminLevel!=='Manager'/);
  assert.match(route,/ticket\.creatorLogin[\s\S]*===login/);
  assert.match(route,/managerRoleSelection\([\s\S]*\.map\(managerUserRole\)/);
  assert.match(route,/creatorRoles\.includes\(ticket\.creatorRole\)&&userManagesSite\(manager,ticket\.site\)/);
  assert.match(route,/res\.json\(\{kind:'ticket',reference,record:ticket\}\)/);
});

test('request target visibility is rebuilt from the live profile and uses Info Pulse scope',()=>{
  assert.match(route,/currentDashboardAuthorization\(req\.session\)/);
  assert.match(route,/infoPulseRequestScope\(authorization\.session,authorization\.user\)/);
  assert.match(route,/authorization\.session\.assignedRole==='Production User'[\s\S]*requesterLogin[\s\S]*===login/);
  assert.match(route,/ownsProductionRequest\?requestResult\.rows:scopeInfoPulseRequests\(requestResult\.rows,scope\)/);
  assert.match(route,/scopeInfoPulseRequests\(requestResult\.rows,scope\)/);
  assert.match(route,/attachDailyRemarks\(visibleRows\)/);
  assert.match(route,/res\.json\(\{kind:'request',reference,record\}\)/);
});
