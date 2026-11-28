import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { completeDieselHandoff, dieselStart, isDieselLogin } from '../src/diesel-handoff.mjs';

const state = 's'.repeat(43);
const challenge = 'h'.repeat(43);
const search = '?' + new URLSearchParams({ dieselSignIn: '1', state, code_challenge: challenge });
const callback = 'https://pulse-lll.cmll.in/api/sign-in/callback?state=' + state + '&code=' + 'c'.repeat(43);

test('Diesel selected on the launcher or on a shared login link takes priority over role dashboards', () => {
  assert.ok(isDieselLogin('?login=diesel'));
  assert.ok(isDieselLogin(search));
  assert.equal(isDieselLogin('?login=mis'), false);
  assert.equal(isDieselLogin(''), false);
  const app = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const routing = app.slice(app.indexOf('if (!session || (new URLSearchParams'));
  assert.match(routing, /if \(locationGate\.phase!=='open'\)[^\n]+\n(?:\s*\/\/[^\n]*\n|\s*if \((?:isMisContinue|isHrLogin)\(window\.location\.search\)\) return <CaliberOneSignIn[^\n]+\n)*\s*if \(isDieselLogin\(window\.location\.search\)\) return <DieselSharedSignIn[^\n]+\n\s*if \(session\.userType/);
});

test('Diesel shows access errors and a successful retry opens its verified callback', async () => {
  const hold = () => Promise.resolve(Response.json({error:'Access denied.'}, {status:403}));
  const pending = await completeDieselHandoff(search, 'test-session', undefined, hold);
  assert.deepEqual(pending, {message:'Access denied.'});
  const result = await completeDieselHandoff(search, 'test-session', undefined, async (path, options) => {
    assert.equal(path, '/api/diesel-sso/continue');
    assert.deepEqual(JSON.parse(options.body), {state, challenge});
    assert.equal(options.headers.Authorization, 'Bearer test-session');
    return Response.json({redirectUrl:callback});
  });
  assert.deepEqual(result, {destination:callback});
});

test('incomplete Diesel launches restart in Diesel and invalid callbacks never open another workspace', async () => {
  assert.deepEqual(await completeDieselHandoff('?login=diesel', 'test-session', undefined, assert.fail), {destination:dieselStart});
  for (const redirectUrl of ['https://pulse.cmll.in/', callback.replace(state, challenge)]) {
    await assert.rejects(completeDieselHandoff(search, 'test-session', undefined, async () => Response.json({redirectUrl})));
  }
});
