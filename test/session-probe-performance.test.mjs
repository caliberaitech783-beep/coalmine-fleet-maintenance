import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');

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
