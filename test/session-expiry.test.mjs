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

test('the UI validates an authenticated 401 before returning to sign-in',()=>{
  assert.match(ui,/window\.fetch = async \(input, init\) => \{/);
  assert.match(ui,/authenticatedApiRequest\(input, requestInit, \{origin: window\.location\.origin, token: authToken\}\)/);
  assert.match(ui,/await sessionExpiry\.check\(response, authenticatedRequest\)/);
  assert.match(ui,/onExpired: \(token\) => \{\s*clearStoredSession\(token\);\s*window\.location\.replace\(`\/\?\$\{SESSION_EXPIRED_PARAM\}=1`\)/);
  assert.doesNotMatch(ui,/closeInvalidSession|if\(response\.status===401\)\s*clearStoredSession/);
  assert.match(ui,/params\.has\(SESSION_EXPIRED_PARAM\)/);
  assert.match(ui,/Your sign-in has expired or was closed\. Please sign in again\./);
});
