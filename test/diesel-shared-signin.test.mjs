import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import { registerDieselSharedSignIn } from '../diesel-shared-signin.mjs';
import { protectDeletionPool } from '../deletion-approval.mjs';
import { pulseSsoSessionCookie } from '../mis-shared-signin.mjs';

test('Diesel authorization codes are browser-bound, single-use and tied to active Pulse sessions', async () => {
  const database = new PGlite();
  const app = express();
  app.use(express.json());
  const secret = 's'.repeat(43);
  const state = 't'.repeat(43);
  const verifier = 'v'.repeat(43);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const session = '59bdc66b-7078-4e0b-8a3b-b60ead7e6691';
  let active = true;
  let employee;
  const issuer = registerDieselSharedSignIn(app, {
    pool: protectDeletionPool(database),
    secret,
    enabled: '1',
    requireSession: (_request, _response, next) => next(),
    readSession: async request => active && request.headers.authorization === 'Bearer ' + session
      ? { login: 'operator', name: 'Operator', permissions: { admin: true } } : null,
    checkLocation: async () => false,
    readEmployee: async profile => {
      assert.equal(profile.login, 'operator');
      return employee;
    },
  });
  await issuer.initialize();
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port + '/api/diesel-sso/';
    const authorize = options => fetch(base + 'authorize?' + new URLSearchParams({ state, code_challenge: challenge }), { redirect: 'manual', ...options });
    assert.match((await authorize()).headers.get('location'), /^\/\?dieselSignIn=1/);
    await database.query(`INSERT INTO diesel_sso (code_hash, state, challenge, session_token, code_expires_at)
      VALUES ('expired-code', $1, $2, $3, now() - interval '1 second')`, [state, challenge, session]);
    const authorized = await authorize({ headers: { Cookie: pulseSsoSessionCookie + '=' + session } });
    const callback = new URL(authorized.headers.get('location'));
    assert.equal(callback.origin, 'https://pulse-lll.cmll.in');
    assert.equal(callback.pathname, '/api/sign-in/callback');
    const code = callback.searchParams.get('code');
    const post = (path, body, token = secret) => fetch(base + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    });
    assert.equal((await post('exchange', { code, state, verifier }, 'wrong')).status, 401);
    assert.equal((await post('exchange', { code, state: 'x'.repeat(43), verifier })).status, 401);
    assert.equal((await post('exchange', { code, state, verifier: 'x'.repeat(43) })).status, 401);
    const responses = await Promise.all([post('exchange', { code, state, verifier }), post('exchange', { code, state, verifier })]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 401]);
    const { grant } = await responses.find(response => response.ok).json();
    const valid = await post('validate', { grant });
    assert.deepEqual(await valid.json(), { profile: { login: 'operator', name: 'Operator' } });
    employee = {empId:'E001',phone:'private',passwordHash:'private'};
    assert.deepEqual(await (await post('validate', { grant })).json(),
      { profile: { login:'operator', name:'Operator', empId:'E001' } });
    active = false;
    assert.equal((await post('validate', { grant })).status, 401);
    active = true;
    assert.equal((await post('revoke', { grant })).status, 204);
    assert.equal((await post('validate', { grant })).status, 401);
  } finally {
    server.close();
    await database.close();
  }
});
