import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {initializeSingleLogin,parseSessionLimitExceptions} from '../single-login.mjs';
import {createSessionStore} from '../auth-session.mjs';

// Owner, 28 Nov 2026: "for mohitchadda user id i can login in 3 login at a time in all ... and for
// others it is ok". mohitchadda keeps his newest 3 sign-ins per application; everyone else keeps one.
const schema=`CREATE TABLE app_metadata(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE auth_sessions(token UUID PRIMARY KEY,session_public_id TEXT UNIQUE DEFAULT gen_random_uuid()::text,role TEXT,employee_name TEXT,login_name TEXT,user_type TEXT,assigned_role TEXT,permissions JSONB,created_at TIMESTAMPTZ DEFAULT NOW(),last_seen_at TIMESTAMPTZ DEFAULT NOW());`;
const open=async()=>{const db=new PGlite();await db.exec(schema);current=(sql,args)=>db.query(sql,args);return {db,pool:{query:(sql,args)=>!args&&sql.includes(';')?db.exec(sql):db.query(sql,args)}};};
const signIns=async(store,login,count,permissions={})=>{const tokens=[];for(let i=0;i<count;i++){const token=randomUUID();tokens.push(token);await store.create({token,login,name:login,role:'normal',permissions});}return tokens;};
// A sign-in is live while it is one of the current sign-ins of its login and application (store.get
// itself refuses MIS, HR and Tender sessions, which those applications check through their grants).
let current;
const live=async(_store,tokens)=>Promise.all(tokens.map(async token=>(await current(`SELECT 1 FROM auth_sessions s JOIN user_current_sessions c ON c.session_id=s.session_public_id WHERE s.token=$1`,[token])).rows.length===1));

test('the setting reads login=count, at most 10, one entry per login',()=>{
 assert.deepEqual(parseSessionLimitExceptions(),[{login:'mohitchadda',allowed:3}]);
 assert.deepEqual(parseSessionLimitExceptions(' MohitChadda=3, anoop=2;bad nobody=0 many=50'),[{login:'mohitchadda',allowed:3},{login:'anoop',allowed:2},{login:'nobody',allowed:1},{login:'many',allowed:10}]);
 assert.deepEqual(parseSessionLimitExceptions(''),[]);
});

test('mohitchadda keeps his newest 3 sign-ins in every application; others keep one',async()=>{
 const {db,pool}=await open();
 try{
  await initializeSingleLogin(pool);
  const store=createSessionStore(pool);
  for(const permissions of [{},{application:'MIS'},{application:'HR'},{application:'Tender'}]){
   const owner=await signIns(store,'MohitChadda',4,permissions);
   assert.deepEqual(await live(store,owner),[false,true,true,true],`${permissions.application||'Fleet'}: the 4th sign-in ends only the oldest`);
   const other=await signIns(store,'anoop',2,permissions);
   assert.deepEqual(await live(store,other),[false,true],`${permissions.application||'Fleet'}: everyone else keeps one`);
  }
  const before=(await db.query("SELECT session_id FROM user_current_sessions WHERE login='mohitchadda' ORDER BY session_id")).rows;
  await initializeSingleLogin(pool);
  assert.deepEqual((await db.query("SELECT session_id FROM user_current_sessions WHERE login='mohitchadda' ORDER BY session_id")).rows,before,'a restart keeps all three');
  await initializeSingleLogin(pool,{exceptions:''});
  const after=await signIns(store,'mohitchadda',1);
  const {rows}=await db.query("SELECT count(*)::int AS n FROM user_current_sessions WHERE login='mohitchadda' AND application='BDMS'");
  assert.equal(rows[0].n,1,'taken off the list, his next sign-in leaves only itself');
  assert.ok(await store.get(after[0]));
 }finally{await db.close();}
});

test('a server already running the one-per-application table upgrades without signing anyone out',async()=>{
 const {db,pool}=await open();
 try{
  await db.exec(`CREATE TABLE user_current_sessions(login TEXT NOT NULL,application TEXT NOT NULL DEFAULT 'BDMS',session_id TEXT NOT NULL UNIQUE REFERENCES auth_sessions(session_public_id) ON DELETE CASCADE,PRIMARY KEY(login,application));`);
  const token=randomUUID();
  await db.query("INSERT INTO auth_sessions(token,login_name,role,employee_name,permissions) VALUES($1,'mohitchadda','normal','Mohit','{}')",[token]);
  await db.query("INSERT INTO user_current_sessions(login,application,session_id) SELECT 'mohitchadda','BDMS',session_public_id FROM auth_sessions WHERE token=$1",[token]);
  await db.query("INSERT INTO app_metadata VALUES('single_session_initialized','yes')");
  await initializeSingleLogin(pool);
  const store=createSessionStore(pool);
  assert.ok(await store.get(token),'the sign-in from before the release still works');
  const more=await signIns(store,'mohitchadda',2);
  assert.deepEqual(await live(store,[token,...more]),[true,true,true]);
 }finally{await db.close();}
});
