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
      token TEXT PRIMARY KEY,role TEXT,employee_name TEXT,login_name TEXT,user_type TEXT,assigned_role TEXT,permissions JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),last_seen_at TIMESTAMPTZ DEFAULT NOW(),session_public_id TEXT,
      ip_address TEXT,device_id TEXT,user_agent TEXT
    ) ON COMMIT DROP`);
    const store=createSessionStore(client);
    for(const [token,role] of [['mobile','normal'],['desktop','super']]){
      await store.create({token,role,name:token});
      await client.query("UPDATE auth_sessions SET last_seen_at=NOW()-INTERVAL '2 days' WHERE token=$1",[token]);
      assert.equal((await store.get(token)).role,role);
    }
    assert.equal(await store.pruneExpired(),0);
    await store.touch('mobile');
    const {rows}=await client.query("SELECT last_seen_at=NOW() AS touched FROM auth_sessions WHERE token='mobile'");
    assert.equal(rows[0].touched,true);
    await client.query("UPDATE auth_sessions SET created_at=NOW()-INTERVAL '31 days' WHERE token='desktop'");
    assert.equal(await store.get('desktop'),null);
    assert.equal(await store.pruneExpired(),1);
    await client.query("DELETE FROM auth_sessions WHERE token='mobile'");
    assert.equal(await store.get('mobile'),null);
  } finally {await client.query('ROLLBACK');client.release();await pool.end();}
});
