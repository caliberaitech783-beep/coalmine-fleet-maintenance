import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import { installCaliberOneSignIn, HR_ORIGIN } from '../caliber-one-signin.mjs';
import { protectDeletionPool } from '../deletion-approval.mjs';
import { completeHrHandoff, completeMisHandoff, hrBack, isHrLogin, isMisContinue, misManualUrl } from '../src/caliber-one-handoff.mjs';
import { pulseTokenFrom, signOutTargets } from '../public/one/one-tabs.mjs';

// Caliber One, one sign-in (owner, 28 Nov 2026): a Pulse session opens MIS and HR Pulse without
// a second password, each with its own access rule, and Sign out all ends what it opened.
const proofOf = value => createHash('sha256').update(value).digest('base64url');
const state = 's'.repeat(43), verifier = 'v'.repeat(43), challenge = proofOf(verifier);
// Sign-ins are UUID tokens, as Pulse issues them.
const PULSE_UUID = '7b0c1d7e-3a4f-4f7a-9d55-1c2b3a4d5e6f';
const PULSE = PULSE_UUID;
const CLERK = '0f3b6c1a-2d4e-4a5b-8c7d-9e0f1a2b3c4d';
const pulseHrProfile = { permissions: { application: 'HR' } };

async function harness(t) {
  const db = new PGlite();
  await db.query("CREATE TABLE master_records(id BIGSERIAL PRIMARY KEY,master_name TEXT NOT NULL,record_data JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await db.query('CREATE TABLE application_identity_grants(grant_hash TEXT PRIMARY KEY,application TEXT NOT NULL,session_token UUID NOT NULL)');
  await db.query('CREATE TABLE auth_sessions(token UUID PRIMARY KEY,permissions JSONB NOT NULL)');
  const user = { login: 'owner', employee: 'Owner', passwordHash: 'hash', userType: 'Super Admin', adminLevel: 'Admin' };
  await db.query("INSERT INTO master_records(master_name,record_data) VALUES('Users & employees',$1),('Users & employees',$2)",
    [user, { login: 'clerk', employee: 'Clerk', passwordHash: 'hash', userType: 'Normal' }]);
  const issued = [];
  const identity = {
    profile: row => row.record_data.login === 'owner' ? { login: 'owner', name: 'Owner', assignedRole: 'MIS Application User' } : null,
    issueGrant: async (row, application, profile, options = {}) => {
      const token = randomUUID(), grant = String.fromCharCode(97 + issued.length).repeat(43);
      await db.query('INSERT INTO auth_sessions(token,permissions) VALUES($1,$2)', [token, { application }]);
      await db.query('INSERT INTO application_identity_grants(grant_hash,application,session_token) VALUES($1,$2,$3)', [grant, application, token]);
      issued.push({ application, login: row.record_data.login, profile, options, grant, token });
      return { grant, token };
    },
    // HR rides on the Pulse session (no new HR session), so it never signs HR out on another screen.
    attachPulseSessionGrant: async (row, application) => {
      const token = PULSE_UUID, grant = String.fromCharCode(97 + issued.length).repeat(43);
      await db.query('INSERT INTO application_identity_grants(grant_hash,application,session_token) VALUES($1,$2,$3)', [grant, application, token]);
      issued.push({ application, login: row.record_data.login, profile: pulseHrProfile, options: { pulseSession: true }, grant, token });
      return { grant, token };
    },
    hooks: {},
    handlers: { '/api/integrations/hr/validate': async (req, res) => {
      const { rows } = await db.query("SELECT 1 FROM application_identity_grants WHERE grant_hash=$1 AND application='HR'", [req.body.grant]);
      return rows[0] ? res.json({ profile: { login: 'owner', permissions: { application: 'HR' } } }) : res.status(401).json({ error: 'expired' });
    } },
  };
  const sessions = { [PULSE]: { login: 'owner', name: 'Owner' }, [CLERK]: { login: 'clerk', name: 'Clerk' } };
  const app = express();
  app.use(express.json());
  const signIn = installCaliberOneSignIn(app, {
    // The production pools are guarded (deletion-approval.mjs); sign-in records must still be deletable.
    pool: protectDeletionPool(db), identity,
    requireSession: (req, res, next) => {
      const session = sessions[String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')];
      if (!session) return res.status(401).json({ error: 'Your sign-in has expired.' });
      req.session = session; next();
    },
    misRedirectFor: async ({ state: s, grant, remember }) => `https://pulse-ll.cmll.in/api/mis-credentials/callback?code=${'k'.repeat(43)}&state=${s}&grant=${grant}&remember=${remember}`,
  });
  await signIn.initialize();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (path, body, token = PULSE, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers }, body: JSON.stringify(body) });
  return { db, issued, post, base };
}

test('a signed-in Pulse person opens MIS without a password; no MIS access or no Pulse session gets nothing', async t => {
  const { issued, post } = await harness(t);
  const opened = await post('/api/mis-login/continue', { state, challenge, remember: true });
  assert.equal(opened.status, 200);
  const target = new URL((await opened.json()).redirectUrl);
  assert.equal(target.origin + target.pathname, 'https://pulse-ll.cmll.in/api/mis-credentials/callback');
  assert.equal(target.searchParams.get('remember'), 'true');
  assert.deepEqual(issued.map(item => [item.application, item.login, item.options.remember]), [['MIS', 'owner', true]]);
  assert.equal((await post('/api/mis-login/continue', { state, challenge }, CLERK)).status, 403, 'MIS access is still needed');
  assert.equal((await post('/api/mis-login/continue', { state, challenge }, '')).status, 401);
  assert.equal((await post('/api/mis-login/continue', { state: 'short', challenge })).status, 400);
  assert.equal(issued.length, 1);
});

test('HR Pulse gets a one-time code that only the page holding the verifier can swap for a grant', async t => {
  const { issued, post, base } = await harness(t);
  const opened = await post('/api/hr-login/continue', { state, challenge });
  assert.equal(opened.status, 200);
  const target = new URL((await opened.json()).redirectUrl);
  assert.equal(target.origin, HR_ORIGIN);
  assert.equal(target.searchParams.get('hrState'), state);
  const code = target.searchParams.get('hrCode');
  assert.equal(issued[0].application, 'HR');
  assert.equal(issued[0].profile.permissions.application, 'HR');
  const swap = (body, origin = HR_ORIGIN) => post('/api/integrations/hr/exchange', body, '', { Origin: origin });
  assert.equal((await swap({ code, state, verifier }, 'https://evil.example')).status, 403, 'only HR Pulse may swap');
  assert.equal((await swap({ code, state, verifier: 'w'.repeat(43) })).status, 401, 'the wrong verifier does not open HR');
  const swapped = await swap({ code, state, verifier });
  assert.equal(swapped.headers.get('access-control-allow-origin'), HR_ORIGIN);
  assert.deepEqual(await swapped.json(), { grant: issued[0].grant, profile: { login: 'owner', permissions: { application: 'HR' } } });
  assert.equal((await swap({ code, state, verifier })).status, 401, 'a code works once');
  const preflight = await fetch(base + '/api/integrations/hr/exchange', { method: 'OPTIONS', headers: { Origin: HR_ORIGIN } });
  assert.equal(preflight.status, 204);
  assert.equal((await post('/api/hr-login/continue', { state, challenge }, CLERK)).status, 403, 'HR access is still needed');
});

test('Sign out all ends the MIS and HR sign-ins this Pulse session opened, and no others', async t => {
  const { db, issued, post } = await harness(t);
  await post('/api/mis-login/continue', { state, challenge });
  await post('/api/hr-login/continue', { state, challenge });
  const other = randomUUID();
  await db.query("INSERT INTO auth_sessions(token,permissions) VALUES($1,'{\"application\":\"MIS\"}')", [other]);
  const out = await post('/api/caliber-one/sign-out-all', {});
  assert.deepEqual(await out.json(), { ok: true, signedOut: 2 });
  const { rows: sessions } = await db.query('SELECT token FROM auth_sessions');
  assert.deepEqual(sessions.map(row => row.token), [other], 'a sign-in on another computer stays');
  const { rows: grants } = await db.query('SELECT 1 FROM application_identity_grants');
  assert.equal(grants.length, 0);
  assert.equal(issued.length, 2);
  assert.equal((await post('/api/caliber-one/sign-out-all', {}, '')).status, 401);
});

test('Pulse screen: MIS goes straight on only with a valid hand-off, HR comes back to its own form', async () => {
  const mis = `?login=mis&misState=${state}&misChallenge=${challenge}`;
  assert.equal(isMisContinue(mis), true);
  assert.equal(isMisContinue(mis + '&misManual=1'), false, 'sign in another way shows the form');
  assert.equal(isMisContinue('?login=mis'), false);
  assert.equal(misManualUrl('https://pulse.cmll.in/' + mis), '/' + mis + '&misManual=1');
  assert.equal(isHrLogin('?hrSignIn=1'), true);
  assert.equal(hrBack('signin'), 'https://hrpulse.cmll.in/?hrSso=signin');
  const fetcher = answer => async () => ({ ok: answer.status === 200, status: answer.status, json: async () => answer.body });
  const misOk = await completeMisHandoff(mis, PULSE, true, undefined, fetcher({ status: 200, body: { redirectUrl: `https://pulse-ll.cmll.in/api/mis-credentials/callback?code=${'k'.repeat(43)}&state=${state}` } }));
  assert.match(misOk.destination, /^https:\/\/pulse-ll\.cmll\.in\/api\/mis-credentials\/callback\?/);
  await assert.rejects(completeMisHandoff(mis, PULSE, true, undefined, fetcher({ status: 200, body: { redirectUrl: `https://evil.example/api/mis-credentials/callback?code=${'k'.repeat(43)}&state=${state}` } })));
  assert.equal((await completeMisHandoff(mis, PULSE, false, undefined, fetcher({ status: 403, body: { error: 'not enabled' } }))).message, 'not enabled');
  const hr = `?hrSignIn=1&state=${state}&code_challenge=${challenge}`;
  assert.equal((await completeHrHandoff(hr, PULSE, undefined, fetcher({ status: 403, body: {} }))).destination, hrBack('noaccess'));
  assert.equal((await completeHrHandoff(hr, PULSE, undefined, fetcher({ status: 401, body: {} }))).destination, hrBack('signin'));
  assert.equal((await completeHrHandoff('?hrSignIn=1', PULSE, undefined, fetcher({ status: 200, body: {} }))).destination, hrBack('signin'));
  const hrOk = await completeHrHandoff(hr, PULSE, undefined, fetcher({ status: 200, body: { redirectUrl: `https://hrpulse.cmll.in/?hrCode=${'k'.repeat(43)}&hrState=${state}` } }));
  assert.equal(hrOk.destination, `https://hrpulse.cmll.in/?hrCode=${'k'.repeat(43)}&hrState=${state}`);
});

test('Caliber One reads the Pulse sign-in from either storage and signs out MIS and HR Pulse by message', () => {
  const store = value => ({ getItem: () => value });
  assert.equal(pulseTokenFrom([store(null), store(JSON.stringify({ token: 'abc' }))]), 'abc');
  assert.equal(pulseTokenFrom([store(JSON.stringify({ token: 'first' })), store(JSON.stringify({ token: 'second' }))]), 'first');
  assert.equal(pulseTokenFrom([store('not json'), store(null)]), '');
  assert.deepEqual(signOutTargets(), [{ key: 'mis', origin: 'https://pulse-ll.cmll.in' }, { key: 'hr', origin: 'https://hrpulse.cmll.in' }]);
});
