import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canViewUserSessions,isSessionViewOnlyUser,requireUserSessionView} from '../user-session-access.mjs';
test('only exact authenticated login receives the additional read permission',()=>{
  for(const login of ['MAHAKDUDANI','mahakdudani',' MahakDudani '])assert.equal(canViewUserSessions({login,role:'super',permissions:{adminLevel:'Manager'}}),true);
  for(const session of [null,{}, {login:'other',name:'MAHAKDUDANI'},{login:'mahakdudani2'},{role:'normal',permissions:{adminLevel:'Admin'}}])assert.equal(canViewUserSessions(session),false);
  assert.equal(canViewUserSessions({role:'super',permissions:{adminLevel:'Admin'}}),true);
  assert.equal(isSessionViewOnlyUser({login:'other'}),false);
  let next=false;
  requireUserSessionView({session:{login:'MAHAKDUDANI'}},{},()=>{next=true;});assert.equal(next,true);
  let status;
  requireUserSessionView({session:{login:'other'}},{status(code){status=code;return this;},json(){}},()=>assert.fail());assert.equal(status,403);
});
test('only read routes receive the exception and management controls are hidden',()=>{
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.match(server,/registerLoginHistoryRoutes\(app,\{pool,requireSuper:requireSession,requireAdministrator:requireUserSessionView/);
  for(const route of ["app.post('/api/user-sessions/:sessionId/messages',requireSuper,requireAdministrator", "app.delete('/api/user-sessions/:sessionId',requireSuper,requireAdministrator", "app.post('/api/user-sessions/:sessionId/assistance',requireSuper,requireAdministrator", "app.delete('/api/user-login-history',requireSuper,requireAdministrator", "app.post('/api/announcements',requireSuper,requireAdministrator"])assert.ok(server.includes(route));
  assert.ok(ui.includes('canViewAdmin||name==="User Sessions"'));
  assert.ok(ui.includes('{viewOnly?"View only":<RemoteAssistanceAction'));
  assert.ok(ui.includes('{!viewOnly&&<button type="button" className="primary" onClick={()=>setAnnouncing(true)}'));
  assert.ok(ui.includes('{!viewOnly&&<button type="button" className="secondary danger"'));
});
