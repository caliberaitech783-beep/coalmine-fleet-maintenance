import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const client=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8').replace(/\r\n/g,'\n');

test('frequent session heartbeat and expiry probes stay off the business-data pool',()=>{
  const start=source.indexOf("app.post('/api/session-heartbeat'");
  const end=source.indexOf("app.get('/api/session-messages'",start);
  const routes=source.slice(start,end);
  assert.match(routes,/authSessionStore\.get\(token\)/);
  assert.match(routes,/authSessionStore\.touch\(token,sessionActivityDetails\(req\)\)/);
  assert.doesNotMatch(routes,/requireSession/);
  assert.doesNotMatch(routes,/readSession\(req\)/);
  assert.doesNotMatch(routes,/sessionStore\.(?:get|touch)/);
});

test('the fallback expiry probe uses the shared adaptive background cadence',()=>{
  const start=client.indexOf("fetch('/api/session-status'");
  const effect=client.slice(start,client.indexOf('},[session?.token]);',start));
  assert.match(effect,/setInterval\(check,adaptiveRefreshInterval\(window,60_000\)\)/);
  assert.doesNotMatch(effect,/setInterval\(check,15000\)/);
});

test('activity heartbeats retain online status without writing every thirty seconds',()=>{
  const start=client.indexOf('const heartbeatIntervalMs=60_000;');
  const effect=client.slice(start,client.indexOf('},[session?.token]);',start));
  assert.ok(start>0);
  assert.ok((effect.match(/<heartbeatIntervalMs/g)||[]).length>=2);
  assert.doesNotMatch(effect,/<30000/);
});
