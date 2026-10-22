import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {prepareHrCredentials} from '../hr-credentials.mjs';
import {hrCredentialProfile,installHrCredentialIdentity} from '../hr-credential-identity.mjs';
import {HR_ALL_PERMISSIONS,hrAccessManagementRequested} from '../hr-permissions.mjs';
import {publicUserRecord,hashPassword} from '../password-auth.mjs';
import {createSessionStore} from '../auth-session.mjs';

const password='existing-pulse-password';
const base={login:'FLEET.ONE',employee:'Person',userType:'Mobile User',userRoles:'Production User',passwordHash:hashPassword(password),hrAccess:true};
test('one HR checkbox preserves the existing identity and strips legacy separate HR credentials',()=>{
 const user=prepareHrCredentials({...base,hrLogin:'old.hr',hrPassword:'unused',hrPasswordHash:'unused',hrDesktopAccess:['Dashboard']});
 assert.equal(user.passwordHash,base.passwordHash);assert.equal(user.login,base.login);assert.equal(user.userRoles,base.userRoles);
 for(const key of ['hrLogin','hrPassword','hrPasswordHash','hrDesktopAccess','hrMobileAccess'])assert.equal(user[key],undefined);
 assert.equal(prepareHrCredentials({employee:'Renamed'},user).hrAccess,true);
 assert.equal(prepareHrCredentials({hrAccess:false},user).hrAccess,false);
 assert.equal(publicUserRecord(user).passwordHash,undefined);
});
test('HR is opt-in and a tick grants the portal on both desktop and mobile without changing Fleet roles',()=>{
 assert.equal(hrCredentialProfile({record_data:{...base,hrAccess:false}}),null);
 assert.equal(hrCredentialProfile({record_data:{...base,hrAccess:undefined,userRoles:'HR User'}}),null);
 for(const bad of [{active:false},{status:'Inactive'},{login:''},{passwordHash:'',phone:''}])assert.equal(hrCredentialProfile({record_data:{...base,...bad}}),null);
 const profile=hrCredentialProfile({record_data:base});
 assert.deepEqual(profile.permissions.hrDesktopAccess,HR_ALL_PERMISSIONS);
 assert.deepEqual(profile.permissions.hrMobileAccess,HR_ALL_PERMISSIONS);
 assert.equal(hrAccessManagementRequested({hrAccess:false},{hrAccess:true}),true);
});
test('HR access assignments remain administrator-only',()=>{
 const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
 assert.ok(source.includes("records.some(record=>hrAccessManagementRequested(record))&&!['Admin','Super Admin'].includes(req.session?.permissions?.adminLevel)"));
 assert.ok(source.includes("hrAccessManagementRequested(record,previousRecord)&&!['Admin','Super Admin'].includes(req.session?.permissions?.adminLevel)"));
});
test('embedded PostgreSQL: existing password, opt-in, revocation, initial password policy, logout, expiry and throttling',async()=>{
 const db=new PGlite();
 try{
  await db.exec("CREATE TABLE master_records(id BIGSERIAL PRIMARY KEY,master_name TEXT,record_data JSONB);CREATE TABLE auth_sessions(token UUID PRIMARY KEY,role TEXT,employee_name TEXT,login_name TEXT,user_type TEXT,assigned_role TEXT,permissions JSONB,created_at TIMESTAMPTZ DEFAULT NOW(),last_seen_at TIMESTAMPTZ DEFAULT NOW(),session_public_id TEXT DEFAULT gen_random_uuid()::text);");
  const pool={query:(sql,params)=>sql.split(';').filter(x=>x.trim()).length>1?db.exec(sql):db.query(sql,params)};
  const routes=new Map(),preflights=new Map();
  const identity=installHrCredentialIdentity({post:(url,handler)=>routes.set(url,handler),options:(url,handler)=>preflights.set(url,handler)},{pool,sessionStore:createSessionStore(pool)});await identity.initialize();
  let user={...base,hrLogin:'legacy.alias',hrPasswordHash:hashPassword('legacy-hr-password')};
  await db.query("INSERT INTO master_records(master_name,record_data) VALUES('Users & employees',$1)",[JSON.stringify(user)]);
  const save=()=>db.query("UPDATE master_records SET record_data=$1 WHERE id=1",[JSON.stringify(user)]);
  const call=async(action,body,{origin='https://hrpulse.cmll.in',method='POST'}={})=>{
   let status=200,value,headers={};const res={set:(key,val)=>{headers[key]=val},vary(){},status(code){status=code;return this},json(data){value=data},end(){}};
   await (method==='OPTIONS'?preflights:routes).get('/api/integrations/hr/'+action)({body,method,headers:{origin},ip:'127.0.0.1'},res,error=>{throw error});return {status,value,headers};
  };
  const sign=()=>call('authenticate',{username:'FLEET.ONE',password});
  assert.equal((await call('authenticate',{username:'fleet.one',password},{origin:'https://untrusted.example'})).status,403);
  assert.equal((await call('authenticate',{}, {method:'OPTIONS'})).status,204);
  assert.equal((await call('authenticate',{username:'legacy.alias',password:'legacy-hr-password'})).status,401);
  assert.equal((await call('authenticate',{username:'fleet.one',password:'wrong'})).status,401);
  const signed=await sign();assert.equal(signed.status,200);
  assert.equal(signed.value.profile.login,base.login);
  assert.deepEqual(signed.value.profile.permissions.hrDesktopAccess,HR_ALL_PERMISSIONS);
  const token=(await db.query('SELECT token FROM auth_sessions')).rows[0].token;assert.equal(await createSessionStore(db).get(token),null);
  assert.equal((await call('validate',{grant:signed.value.grant})).status,200);
  user.hrAccess=false;await save();assert.equal((await sign()).status,401);assert.equal((await call('validate',{grant:signed.value.grant})).status,401);
  user.hrAccess=true;user.passwordHash=hashPassword('new-pulse-password');await save();
  assert.equal((await call('validate',{grant:signed.value.grant})).status,401);
  assert.equal((await sign()).status,401);
  let again=await call('authenticate',{username:'fleet.one',password:'new-pulse-password'});assert.equal(again.status,200);
  await call('logout',{grant:again.value.grant});assert.equal((await call('validate',{grant:again.value.grant})).status,401);
  again=await call('authenticate',{username:'fleet.one',password:'new-pulse-password'});await db.exec("UPDATE hr_credential_grants SET expires_at=NOW()-INTERVAL '1 second'");assert.equal((await call('validate',{grant:again.value.grant})).status,401);
  user.mustChangePassword=true;await save();assert.equal((await call('authenticate',{username:'fleet.one',password:'new-pulse-password'})).status,403);
  for(let index=0;index<10;index++)await call('authenticate',{username:'missing',password:'bad'});assert.equal((await call('authenticate',{username:'missing',password:'bad'})).status,429);
 }finally{await db.close();}
});
