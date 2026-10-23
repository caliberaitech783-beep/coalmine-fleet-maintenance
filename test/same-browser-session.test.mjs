import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {initializeSingleLogin} from '../single-login.mjs';
import {createSessionStore} from '../auth-session.mjs';

test('password-verified same-browser logins retain tabs without reviving replaced, revoked or expired sessions', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE app_metadata(key TEXT PRIMARY KEY,value TEXT);
      CREATE TABLE auth_sessions(token UUID PRIMARY KEY,session_public_id TEXT UNIQUE DEFAULT gen_random_uuid()::text,
      role TEXT,employee_name TEXT,login_name TEXT,user_type TEXT,assigned_role TEXT,permissions JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),last_seen_at TIMESTAMPTZ DEFAULT NOW(),ip_address TEXT,device_id TEXT,user_agent TEXT);`);
    const calls = [];
    const query = (sql, args) => {
      calls.push(sql);
      // PGlite is single-client; PostgreSQL supplies the transaction lock in production.
      if (sql.includes('pg_advisory_xact_lock')) return {rows: []};
      return !args && sql.includes(';') ? db.exec(sql) : db.query(sql, args);
    };
    const pool = {query, connect: async () => ({query, release() {}})};
    await initializeSingleLogin(pool);
    const store = createSessionStore(pool);
    const profile = {login: 'Anoop', role: 'super', name: 'Anoop', userType: 'Super User', assignedRole: '', permissions: {adminLevel: 'Admin'}};
    const login = (deviceId, extra = {}) => store.createForVerifiedDevice({...profile, token: randomUUID(), ...extra}, {deviceId, userAgent: 'Browser', ipAddress: '127.0.0.1'});
    const first = await login('browser-a');
    const created = (await db.query('SELECT created_at FROM auth_sessions WHERE token=$1', [first])).rows[0].created_at;
    assert.equal(await login('browser-a'), first, 'a second tab reuses the current browser token');
    assert.ok(await store.get(first));
    assert.equal(new Date((await db.query('SELECT created_at FROM auth_sessions WHERE token=$1', [first])).rows[0].created_at).getTime(), new Date(created).getTime(), 'reuse must not extend absolute expiry');
    const secondDevice = await login('browser-b');
    assert.notEqual(secondDevice, first);
    assert.equal(await store.get(first), null, 'another device still replaces the login');
    const returningDevice = await login('browser-a');
    assert.notEqual(returningDevice, first, 'a displaced token must never be resurrected');
    assert.equal(await store.get(secondDevice), null);
    const changedPermissions = await login('browser-a', {permissions: {adminLevel: 'Super Admin'}});
    assert.notEqual(changedPermissions, returningDevice, 'authorization changes require a new token');
    assert.equal(await store.get(returningDevice), null);
    await db.query('DELETE FROM auth_sessions WHERE token=$1', [changedPermissions]);
    const afterLogout = await login('browser-a');
    assert.notEqual(afterLogout, changedPermissions);
    await db.query("UPDATE auth_sessions SET created_at=NOW()-INTERVAL '8 days' WHERE token=$1", [afterLogout]);
    const afterExpiry = await login('browser-a');
    assert.notEqual(afterExpiry, afterLogout);
    assert.equal(await store.get(afterLogout), null);
    assert.notEqual(await login(''), afterExpiry, 'unknown devices cannot reuse tokens');
    assert.ok(calls.some(sql => sql.includes('pg_advisory_xact_lock')), 'serialize browser logins by account/application');
    assert.equal(calls.filter(sql => sql === 'BEGIN').length, calls.filter(sql => sql === 'COMMIT').length);
  } finally { await db.close(); }
});
