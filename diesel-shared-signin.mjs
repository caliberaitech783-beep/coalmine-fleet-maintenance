import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { pulseSsoSessionCookie } from './mis-shared-signin.mjs';

const proof = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const digest = value => createHash('sha256').update(value).digest('base64url');
const bearer = request => String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
const cookie = (request, name) => String(request.headers.cookie || '').split(';')
  .map(entry => entry.trim()).find(entry => entry.startsWith(name + '='))?.slice(name.length + 1) || '';

export function registerDieselSharedSignIn(app, { pool, requireSession, readSession, checkLocation, secret, enabled, dieselOrigin, readMasters, readEmployee }) {
  let callback;
  if (proof(secret) && enabled === '1') {
    const origin = new URL(dieselOrigin || 'https://pulse-lll.cmll.in');
    if (origin.protocol !== 'https:' || origin.username || origin.password) throw new Error('Diesel sign-in requires an HTTPS origin.');
    callback = new URL('/api/sign-in/callback', origin).toString();
  }
  let ready = false;
  const route = handler => async (request, response) => {
    request.audit = false;
    response.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    if (!ready) return response.status(503).json({ error: 'Diesel sign-in is temporarily unavailable.' });
    try {
      await handler(request, response);
    } catch (error) {
      if (error.status === 403) return response.status(403).json({ error: 'Complete your Pulse sign-in requirements before opening Diesel.' });
      response.status(503).json({ error: 'Diesel sign-in is temporarily unavailable.' });
    }
  };
  const serverRoute = handler => route((request, response) => {
    const token = bearer(request);
    if (!proof(token) || !timingSafeEqual(Buffer.from(token), Buffer.from(secret))) return response.sendStatus(401);
    return handler(request, response);
  });
  async function profileFor(token, request, response) {
    if (!token) return null;
    const authRequest = { path: request.path, headers: { authorization: 'Bearer ' + token } };
    const profile = await readSession(authRequest);
    if (profile && await checkLocation(authRequest, response, profile)) return null;
    return profile;
  }

  async function issueCode(state, challenge, token) {
    const code = randomBytes(32).toString('base64url');
    await pool.query('DELETE FROM diesel_sso WHERE coalesce(grant_expires_at, code_expires_at) <= now()');
    await pool.query(
      `INSERT INTO diesel_sso (code_hash, state, challenge, session_token, code_expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '60 seconds')`,
      [digest(code), state, challenge, token]);
    const target = new URL(callback);
    target.searchParams.set('code', code);
    target.searchParams.set('state', state);
    return target.toString();
  }

  app.get('/api/diesel-sso/authorize', route(async (request, response) => {
    const { state, code_challenge: challenge } = request.query;
    if (!proof(state) || !proof(challenge)) return response.sendStatus(400);
    const token = cookie(request, pulseSsoSessionCookie);
    const profile = await profileFor(token, request, response);
    if (response.headersSent) return;
    if (!profile?.login) {
      const login = new URLSearchParams({ dieselSignIn: '1', state, code_challenge: challenge });
      return response.redirect(303, '/?' + login);
    }
    response.redirect(303, await issueCode(state, challenge, token));
  }));
  app.post('/api/diesel-sso/continue', requireSession, route(async (request, response) => {
    const { state, challenge } = request.body || {};
    if (!proof(state) || !proof(challenge)) return response.sendStatus(400);
    response.json({ redirectUrl: await issueCode(state, challenge, bearer(request)) });
  }));
  app.post('/api/diesel-sso/exchange', serverRoute(async (request, response) => {
    const { code, state, verifier } = request.body || {};
    if (!proof(code) || !proof(state) || !proof(verifier)) return response.sendStatus(400);
    const grant = randomBytes(32).toString('base64url');
    const { rows } = await pool.query(
      `UPDATE diesel_sso SET grant_hash = $1, grant_expires_at = now() + interval '8 hours'
       WHERE code_hash = $2 AND state = $3 AND challenge = $4 AND code_expires_at > now()
         AND grant_hash IS NULL RETURNING session_token`,
      [digest(grant), digest(code), state, digest(verifier)]);
    const profile = await profileFor(rows[0]?.session_token, request, response);
    if (response.headersSent) return;
    if (!profile?.login) return response.sendStatus(401);
    response.json({ grant });
  }));
  app.post('/api/diesel-sso/validate', serverRoute(async (request, response) => {
    const { grant } = request.body || {};
    if (!proof(grant)) return response.sendStatus(401);
    const { rows } = await pool.query(
      'SELECT session_token FROM diesel_sso WHERE grant_hash = $1 AND grant_expires_at > now()', [digest(grant)]);
    const profile = await profileFor(rows[0]?.session_token, request, response);
    if (response.headersSent) return;
    if (!profile?.login) return response.sendStatus(401);
    const employee = await readEmployee?.(profile);
    response.json({ profile: { login: profile.login, name: profile.name, ...(employee ? {empId: employee.empId} : {}) } });
  }));
  // Diesel's read-only copy of the Site, Region, Equipment, Employee and Driver masters. Diesel's
  // server asks with the shared secret and the grant of a person who is signed in to Pulse now.
  app.post('/api/diesel-sso/masters', serverRoute(async (request, response) => {
    const { grant } = request.body || {};
    if (!proof(grant)) return response.sendStatus(401);
    const { rows } = await pool.query(
      'SELECT session_token FROM diesel_sso WHERE grant_hash = $1 AND grant_expires_at > now()', [digest(grant)]);
    const profile = await profileFor(rows[0]?.session_token, request, response);
    if (response.headersSent) return;
    if (!profile?.login) return response.sendStatus(401);
    if (!readMasters) return response.sendStatus(404);
    // erpDrivers is false when the ERP driver list could not be read and the Driver master holds directory drivers only.
    const { masters, erpDrivers } = await readMasters();
    response.json({ masters, erpDrivers });
  }));
  app.post('/api/diesel-sso/revoke', serverRoute(async (request, response) => {
    const { grant } = request.body || {};
    if (!proof(grant)) return response.sendStatus(400);
    await pool.query('DELETE FROM diesel_sso WHERE grant_hash = $1', [digest(grant)]);
    response.sendStatus(204);
  }));

  return {
    async initialize() {
      if (!callback) return;
      await pool.query(`CREATE TABLE IF NOT EXISTS diesel_sso (
        code_hash TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        challenge TEXT NOT NULL,
        session_token UUID NOT NULL,
        code_expires_at TIMESTAMPTZ NOT NULL,
        grant_hash TEXT UNIQUE,
        grant_expires_at TIMESTAMPTZ
      )`);
      ready = true;
    },
  };
}
