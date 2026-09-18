import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {initializeLoginHistory,loginHistoryRange,registerLoginHistoryRoutes} from '../user-login-history.mjs';

test('history windows use rolling hours and inclusive India calendar dates',()=>{
  const now=new Date('2026-09-14T12:00:00Z');
  assert.equal(loginHistoryRange({period:'24h'},now).from.toISOString(),'2026-09-13T12:00:00.000Z');
  assert.equal(loginHistoryRange({},now).from.toISOString(),'2026-09-07T12:00:00.000Z');
  assert.deepEqual(loginHistoryRange({period:'all'},now),{from:new Date('2000-01-01T00:00:00Z'),to:now},'the Never logged in view asks for every retained login, no date window');
  const range=loginHistoryRange({period:'custom',from:'2026-09-01',to:'2026-09-07'});
  assert.equal(range.from.toISOString(),'2026-08-31T18:30:00.000Z');
  assert.equal(range.to.toISOString(),'2026-09-07T18:30:00.000Z');
  for(const from of ['2026-02-30','bad','2027-01-01'])assert.throws(()=>loginHistoryRange({period:'custom',from,to:'2026-09-07'}));
});

test('history routes require administrator access and reject invalid ranges before querying',async()=>{
  let handler;
  const superGuard=()=>{},adminGuard=()=>{};
  registerLoginHistoryRoutes({get(path,...callbacks){assert.equal(path,'/api/user-login-history');assert.deepEqual(callbacks.slice(0,2),[superGuard,adminGuard]);handler=callbacks[2];}},
    {pool:{query(){assert.fail('Invalid dates must not query');}},requireSuper:superGuard,requireAdministrator:adminGuard});
  await handler({query:{period:'custom',from:'invalid'}},{status(code){assert.equal(code,400);return this;},json(data){assert.match(data.error,/valid/);}},error=>{throw error;});
});

const connectionString=process.env.AUTH_SESSION_TEST_DATABASE_URL;
test('PostgreSQL: distinct logins survive session deletion and audit export, with inclusive date filtering', {skip:!connectionString},async()=>{
  const pool=new pg.Pool({connectionString,ssl:process.env.AUTH_SESSION_TEST_DATABASE_SSL==='false'?false:{rejectUnauthorized:false},max:1});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const schema=`history_test_${randomUUID().replaceAll('-','')}`;
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET LOCAL search_path TO ${schema}`);
    await client.query(`CREATE TABLE auth_sessions (session_public_id TEXT PRIMARY KEY,login_name TEXT,employee_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),last_seen_at TIMESTAMPTZ DEFAULT NOW(),device_id TEXT DEFAULT '',ip_address TEXT DEFAULT '',user_agent TEXT DEFAULT '');
      CREATE TABLE user_session_activity (session_id TEXT,actor_login TEXT,actor_name TEXT,started_at TIMESTAMPTZ,last_seen_at TIMESTAMPTZ,device_id TEXT,ip_address TEXT,user_agent TEXT);
      CREATE TABLE app_metadata (key TEXT PRIMARY KEY,value TEXT);
      CREATE TABLE master_records (id TEXT,master_name TEXT,record_data JSONB);`);
    await initializeLoginHistory(client);
    await client.query(`INSERT INTO auth_sessions(session_public_id,login_name,employee_name) VALUES ('one',' Alice ','Alice'),('two','alice','Alice');
      UPDATE auth_sessions SET device_id='mobile' WHERE session_public_id='two';
      DELETE FROM auth_sessions WHERE session_public_id='one';
      DELETE FROM user_session_activity;
      INSERT INTO master_records VALUES ('a','Users & employees','{"login":"Alice","employee":"Alice","password":"secret"}'),
        ('b','Users & employees','{"login":"Bob","employee":"Bob"}');`);
    await initializeLoginHistory(client);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM user_login_history')).rows[0].n,2);
    let handler;
    registerLoginHistoryRoutes({get(_path,...handlers){handler=handlers.at(-1);}}, {pool:client,requireSuper:()=>{},requireAdministrator:()=>{},locationName:()=> 'Site A'});
    let result;
    const res={set(){},json(value){result=value;}};
    await handler({query:{period:'24h',login:'ALICE'}},res,error=>{throw error;});
    assert.equal(result.sessions.length,2);
    assert.equal(result.sessions.filter(row=>row.active).length,1);
    assert.equal(result.sessions.find(row=>row.sessionId==='two').deviceId,'mobile');
    await handler({query:{}},res,error=>{throw error;});
    assert.equal(result.users.find(row=>row.login==='Alice').loginCount,2);
    assert.equal(result.users.find(row=>row.login==='Bob').activity,'No recorded login');
    assert.ok(!JSON.stringify(result).includes('secret'));
    assert.ok(!JSON.stringify(result).includes('token'));
  }finally{await client.query('ROLLBACK');client.release();await pool.end();}
});
