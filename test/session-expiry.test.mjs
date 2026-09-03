import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');

test('super-only routes answer a missing session with 401, not 403',()=>{
  const requireSuper=server.slice(server.indexOf('async function requireSuper'),server.indexOf('app.get(\'/api/navigation-settings\''));
  assert.match(requireSuper,/if\(!session\)return res\.status\(401\)\.json\(\{error:'Your sign-in has expired\. Please sign in again\.'\}\)/);
  assert.match(requireSuper,/if\(session\.role!=='super'\)return res\.status\(403\)/);
  assert.doesNotMatch(requireSuper,/status\(403\)\.json\(\{error:'Your sign-in has expired/);
});

test('the UI signs out and returns to the login screen when an API call reports an expired session',()=>{
  assert.match(ui,/window\.fetch = async \(input, init\) => \{/);
  assert.match(ui,/response\.status === 401 && authToken && url\.startsWith\("\/api\/"\) && !url\.startsWith\("\/api\/login"\)/);
  assert.match(ui,/clearStoredSession\(\);\s*window\.location\.replace\(`\/\?\$\{SESSION_EXPIRED_PARAM\}=1`\)/);
  assert.match(ui,/params\.has\(SESSION_EXPIRED_PARAM\)/);
  assert.match(ui,/Your sign-in expired, usually because the application was updated\. Please sign in again\./);
});
