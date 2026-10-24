import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import {verifySessionSchemaCompatibility} from './helpers/session-schema-regression.mjs';

const connectionString=process.env.AUTH_SESSION_TEST_DATABASE_URL;
test('real PostgreSQL: login survives the reverted public-ID schema without invalidating sessions',{
  skip:!connectionString,
},async()=>{
  const pool=new pg.Pool({connectionString,ssl:process.env.AUTH_SESSION_TEST_DATABASE_SSL==='false'?false:{rejectUnauthorized:false},max:1});
  const client=await pool.connect();
  try {await verifySessionSchemaCompatibility(client);}
  finally {client.release();await pool.end();}
});

test('real PostgreSQL: all roles remain signed in after inactivity while absolute expiry and revocation apply', {skip:!connectionString}, async()=>{
  const {createSessionStore}=await import('../auth-session.mjs');
  const pool=new pg.Pool({connectionString,ssl:process.env.AUTH_SESSION_TEST_DATABASE_SSL==='false'?false:{rejectUnauthorized:false},max:1});
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TEMP TABLE auth_sessions (
      token UUID PRIMARY KEY,role TEXT,employee_name TEXT,login_name TEXT,user_type TEXT,assigned_role TEXT,permissions JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),last_seen_at TIMESTAMPTZ DEFAULT NOW(),session_public_id TEXT DEFAULT gen_random_uuid()::text,
      ip_address TEXT,device_id TEXT,user_agent TEXT
    ) ON COMMIT DROP`);
    await client.query('CREATE TEMP TABLE user_current_sessions(login TEXT PRIMARY KEY,session_id TEXT UNIQUE) ON COMMIT DROP');
    const store=createSessionStore(client);
    for(const [token,role] of [['11111111-1111-4111-8111-111111111111','normal'],['22222222-2222-4222-8222-222222222222','super']]){
      await store.create({token,role,name:token,login:token});
      await client.query('INSERT INTO user_current_sessions SELECT lower(trim(login_name)),session_public_id FROM auth_sessions WHERE token=$1',[token]);
      await client.query("UPDATE auth_sessions SET last_seen_at=NOW()-INTERVAL '2 days' WHERE token=$1",[token]);
      assert.equal((await store.get(token)).role,role);
    }
    assert.equal(await store.pruneExpired(),0);
    await store.touch('11111111-1111-4111-8111-111111111111');
    const {rows}=await client.query("SELECT last_seen_at=NOW() AS touched FROM auth_sessions WHERE token='11111111-1111-4111-8111-111111111111'");
    assert.equal(rows[0].touched,true);
    await client.query("UPDATE auth_sessions SET created_at=NOW()-INTERVAL '8 days' WHERE token='22222222-2222-4222-8222-222222222222'");
    assert.equal(await store.get('22222222-2222-4222-8222-222222222222'),null);
    assert.equal(await store.pruneExpired(),0); // No deletion before a backup-gated job is supplied.
    assert.equal((await client.query("SELECT COUNT(*)::int AS count FROM auth_sessions WHERE token='22222222-2222-4222-8222-222222222222'")).rows[0].count,1);
    await client.query("DELETE FROM auth_sessions WHERE token='11111111-1111-4111-8111-111111111111'");
    assert.equal(await store.get('11111111-1111-4111-8111-111111111111'),null);
  } finally {await client.query('ROLLBACK');client.release();await pool.end();}
});
