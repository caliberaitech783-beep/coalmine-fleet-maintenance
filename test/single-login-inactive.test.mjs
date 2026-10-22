import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';
import {initializeSingleLogin} from '../single-login.mjs';import {createSessionStore} from '../auth-session.mjs';
import {initializeLoginDays,registerInactiveUsers} from '../inactive-users.mjs';
test('15 logins leave exactly one valid token; touch/logout/restart never restore earlier tokens',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE app_metadata(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE auth_sessions(token UUID PRIMARY KEY,session_public_id TEXT UNIQUE DEFAULT gen_random_uuid()::text,role TEXT,employee_name TEXT,login_name TEXT,user_type TEXT,assigned_role TEXT,permissions JSONB,created_at TIMESTAMPTZ DEFAULT NOW(),last_seen_at TIMESTAMPTZ DEFAULT NOW(),ip_address TEXT,device_id TEXT,user_agent TEXT);`);
 const pool={query:(sql,args)=>!args&&sql.includes(';')?db.exec(sql):db.query(sql,args)};await initializeSingleLogin(pool);const store=createSessionStore(pool),tokens=[];
 for(let i=0;i<15;i++){const token=randomUUID();tokens.push(token);await store.create({token,role:'normal',name:'Alice',login:i%2?' Alice ':'ALICE'});}
 assert.equal((await db.query('SELECT * FROM user_current_sessions')).rows.length,1);assert.equal((await db.query('SELECT * FROM auth_sessions')).rows.length,15,'retain old rows for backup/history');
 for(const token of tokens.slice(0,-1))assert.equal(await store.get(token),null);
 assert.ok(await store.get(tokens.at(-1)));await store.touch(tokens[0]);assert.equal(await store.get(tokens[0]),null,'old heartbeat cannot regain access');
 await db.query('DELETE FROM auth_sessions WHERE token=$1',[tokens.at(-1)]);await initializeSingleLogin(pool);for(const token of tokens.slice(0,-1))assert.equal(await store.get(token),null,'restart after logout cannot revive old sessions');
 }finally{await db.close()}
});
test('inactive user dates use durable login days, count each account once, and return no secrets',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE app_metadata(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE auth_sessions(login_name TEXT,created_at TIMESTAMPTZ);CREATE TABLE user_login_history(login TEXT,started_at TIMESTAMPTZ);CREATE TABLE user_login_summary(login TEXT PRIMARY KEY,last_login_at TIMESTAMPTZ,last_activity_at TIMESTAMPTZ);CREATE TABLE master_records(id BIGSERIAL PRIMARY KEY,master_name TEXT,record_data JSONB);`);
 const pool={query:(sql,args)=>!args&&sql.includes(';')?db.exec(sql):db.query(sql,args)};await initializeLoginDays(pool);
 await db.query("UPDATE app_metadata SET value='2026-10-01' WHERE key='login_days_complete_from'");
 for(const user of [{login:'Alice',employee:'Alice',passwordHash:'never-expose'},{login:'Bob',employee:'Bob',passwordHash:'never-expose'},{login:' BOB ',employee:'Bob latest',passwordHash:'never-expose',active:false},{login:'NoPassword',employee:'Employee only'}])await db.query("INSERT INTO master_records(master_name,record_data) VALUES('Users & employees',$1)",[JSON.stringify(user)]);
 await db.query("INSERT INTO auth_sessions VALUES('alice','2026-10-22T18:29:59Z'),('bob','2026-10-22T18:30:00Z')");
 let handler;registerInactiveUsers({get:(path,...fns)=>{handler=fns.at(-1)}},{pool,requireSession(){},requireView(){},locationName:()=> 'Site A'});
 const call=async(query)=>{let data,status=200;await handler({query},{set(){},status(code){status=code;return this},json(value){data=value}},error=>{throw error});return {data,status}};
 const result=await call({from:'2026-10-22',to:'2026-10-22'});assert.equal(result.status,200);assert.equal(result.data.totalUsers,2);assert.equal(result.data.inactiveUsers,1);assert.equal(result.data.users[0].name,'Bob latest');assert.equal(result.data.users[0].accountStatus,'Disabled');assert.equal(result.data.loggedInUsers,1);assert.ok(!JSON.stringify(result.data).includes('never-expose'));
 await db.query('DELETE FROM user_login_history');assert.equal((await call({from:'2026-10-22',to:'2026-10-22'})).data.inactiveUsers,1,'detailed history cleanup does not lose day evidence');
 assert.equal((await call({from:'2026-09-01',to:'2026-10-22'})).status,400,'incomplete older history cannot falsely mark users inactive');assert.equal((await call({from:'invalid',to:'2026-10-22'})).status,400);
 }finally{await db.close()}
});
import pg from 'pg';
const connectionString=process.env.AUTH_SESSION_TEST_DATABASE_URL;
test('PostgreSQL concurrent logins select exactly one winner', {skip:!connectionString},async()=>{
 const schema='single_login_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString,ssl:process.env.AUTH_SESSION_TEST_DATABASE_SSL==='false'?false:undefined});
 let pool;
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool=new pg.Pool({connectionString,ssl:process.env.AUTH_SESSION_TEST_DATABASE_SSL==='false'?false:undefined,options:`-c search_path=${schema}`,max:5});
  await pool.query(`CREATE TABLE app_metadata(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE auth_sessions(token UUID PRIMARY KEY,session_public_id TEXT UNIQUE DEFAULT gen_random_uuid()::text,role TEXT,employee_name TEXT,login_name TEXT,user_type TEXT,assigned_role TEXT,permissions JSONB,created_at TIMESTAMPTZ DEFAULT NOW(),last_seen_at TIMESTAMPTZ DEFAULT NOW());`);
  await initializeSingleLogin(pool);const store=createSessionStore(pool);const tokens=Array.from({length:15},()=>randomUUID());
  await Promise.all(tokens.map(token=>store.create({token,login:'same-user',name:'Person',role:'normal'})));
  const authorized=await Promise.all(tokens.map(token=>store.get(token)));assert.equal(authorized.filter(Boolean).length,1);
 }finally{if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end()}
});
