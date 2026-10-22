import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {prepareHrCredentials} from '../hr-credentials.mjs';
import {hrCredentialProfile,installHrCredentialIdentity} from '../hr-credential-identity.mjs';
import {HR_ALL_PERMISSIONS,normalizedHrSelection,hrAccessManagementRequested} from '../hr-permissions.mjs';
import {publicUserRecord,verifyPassword} from '../password-auth.mjs';
import {createSessionStore} from '../auth-session.mjs';
import {userMasterRole} from '../src/user-master-role.mjs';

const base={login:'FLEET.ONE',employee:'Person',hrAccess:true,hrLogin:'HR.ONE',hrPassword:'separate-hr-secret-123',hrDesktopAccess:HR_ALL_PERMISSIONS,hrMobileAccess:['Dashboard']};
test('HR credentials are independent, hashed, preserved on edits and never public',()=>{
 const user=prepareHrCredentials({...base,passwordHash:'existing-fleet-hash',misPasswordHash:'existing-mis-hash'});
 assert.equal(user.hrLogin,'hr.one');assert.ok(verifyPassword(base.hrPassword,user.hrPasswordHash));assert.equal(user.hrPassword,undefined);
 assert.equal(user.passwordHash,'existing-fleet-hash');assert.equal(user.misPasswordHash,'existing-mis-hash');
 const edited=prepareHrCredentials({...publicUserRecord(user),hrPassword:''},user);assert.equal(edited.hrPasswordHash,user.hrPasswordHash);
 assert.equal(prepareHrCredentials({employee:'Renamed'},user).hrPasswordHash,user.hrPasswordHash);
 const exposed=publicUserRecord({...user,hrPassword:'never-send'});for(const key of ['hrPassword','hrPasswordHash','passwordHash','misPasswordHash'])assert.equal(exposed[key],undefined);
 assert.equal(userMasterRole({userType:'HR Application User'}),'HR Application User');
});
test('HR portal access is opt-in, allowlisted and separate from existing Fleet HR team roles',()=>{
 assert.equal(hrCredentialProfile({record_data:{userType:'Mobile User',userRoles:'HR User'}}),null);
 assert.deepEqual(normalizedHrSelection(['Admin','all','Dashboard','Dashboard','Holiday & Leave']),['Dashboard','Holiday & Leave']);
 assert.throws(()=>prepareHrCredentials({...base,hrLogin:'!'}),/username/);
 assert.throws(()=>prepareHrCredentials({...base,hrPassword:''}),/password/);
 assert.throws(()=>prepareHrCredentials({...base,hrDesktopAccess:[],hrMobileAccess:[]}),/at least one/);
 assert.equal(hrAccessManagementRequested({hrAccess:false}),false);
 assert.equal(hrAccessManagementRequested({hrAccess:false},{hrAccess:true}),true);
 assert.equal(hrAccessManagementRequested({hrDesktopAccess:['Dashboard']}),true);
 const user=prepareHrCredentials(base);
 for(const bad of [{hrAccess:false},{active:false},{status:'Inactive'},{hrDesktopAccess:[],hrMobileAccess:[]}])assert.equal(hrCredentialProfile({record_data:{...user,...bad}}),null);
});
test('HR management routes require an administrator and HR-only users cannot use Fleet login',()=>{
 const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
 assert.ok(source.includes("records.some(record=>hrAccessManagementRequested(record))&&!['Admin','Super Admin'].includes(req.session?.permissions?.adminLevel)"));
 assert.ok(source.includes("hrAccessManagementRequested(record,previousRecord)&&!['Admin','Super Admin'].includes(req.session?.permissions?.adminLevel)"));
 assert.ok(source.includes("['MIS Application User','HR Application User'].includes(record.userType)"));
 assert.ok(source.includes('storedRecord=prepareHrCredentials(storedRecord,previousRecord)'));
});
test('embedded PostgreSQL: sign-in, origin restriction, revocation, menu refresh, logout, expiry and throttling',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE master_records(id BIGSERIAL PRIMARY KEY,master_name TEXT,record_data JSONB);CREATE TABLE auth_sessions(token UUID PRIMARY KEY,role TEXT,employee_name TEXT,login_name TEXT,user_type TEXT,assigned_role TEXT,permissions JSONB,created_at TIMESTAMPTZ DEFAULT NOW(),last_seen_at TIMESTAMPTZ DEFAULT NOW(),session_public_id TEXT DEFAULT gen_random_uuid()::text);`);
  const pool={query:(sql,params)=>sql.split(';').filter(x=>x.trim()).length>1?db.exec(sql):db.query(sql,params)};
  const routes=new Map(),preflights=new Map();
  const identity=installHrCredentialIdentity({post:(url,handler)=>routes.set(url,handler),options:(url,handler)=>preflights.set(url,handler)},{pool,sessionStore:createSessionStore(pool)});await identity.initialize();
  let user=prepareHrCredentials(base);await db.query("INSERT INTO master_records(master_name,record_data) VALUES('Users & employees',$1)",[JSON.stringify(user)]);
  const call=async(action,body,{origin='https://hrpulse.cmll.in',method='POST'}={})=>{
   let status=200,value,headers={};const res={set:(key,val)=>{headers[key]=val},vary(){},status(code){status=code;return this},json(data){value=data},end(){}};
   await (method==='OPTIONS'?preflights:routes).get('/api/integrations/hr/'+action)({body,method,headers:{origin},ip:'127.0.0.1'},res,error=>{throw error});return {status,value,headers};
  };
  assert.equal((await call('authenticate',{username:'hr.one',password:base.hrPassword},{origin:'https://untrusted.example'})).status,403);
  const preflight=await call('authenticate',{}, {method:'OPTIONS'});assert.equal(preflight.status,204);assert.equal(preflight.headers['Access-Control-Allow-Origin'],'https://hrpulse.cmll.in');
  assert.equal((await call('authenticate',{username:'hr.one',password:'wrong'})).status,401);
  const signed=await call('authenticate',{username:'HR.ONE',password:base.hrPassword});assert.equal(signed.status,200);assert.equal(signed.value.profile.permissions.application,'HR');
  const token=(await db.query('SELECT token FROM auth_sessions')).rows[0].token;assert.equal(await createSessionStore(db).get(token),null,'HR session cannot authorize Fleet APIs');
  assert.equal((await call('validate',{grant:signed.value.grant})).status,200);
  user.hrDesktopAccess=['Employee Master'];await db.query('UPDATE master_records SET record_data=$1',[JSON.stringify(user)]);assert.deepEqual((await call('validate',{grant:signed.value.grant})).value.profile.permissions.hrDesktopAccess,['Employee Master']);
  user.hrAccess=false;await db.query('UPDATE master_records SET record_data=$1',[JSON.stringify(user)]);assert.equal((await call('validate',{grant:signed.value.grant})).status,401);
  user=prepareHrCredentials({...user,hrAccess:true,hrPassword:'replacement-hr-password-456'},user);await db.query('UPDATE master_records SET record_data=$1',[JSON.stringify(user)]);assert.equal((await call('validate',{grant:signed.value.grant})).status,401);
  let again=await call('authenticate',{username:'hr.one',password:'replacement-hr-password-456'});await call('logout',{grant:again.value.grant});assert.equal((await call('validate',{grant:again.value.grant})).status,401);
  again=await call('authenticate',{username:'hr.one',password:'replacement-hr-password-456'});await db.exec("UPDATE hr_credential_grants SET expires_at=NOW()-INTERVAL '1 second'");assert.equal((await call('validate',{grant:again.value.grant})).status,401);
  for(let index=0;index<10;index++)await call('authenticate',{username:'missing',password:'bad'});assert.equal((await call('authenticate',{username:'missing',password:'bad'})).status,429);
  await assert.rejects(db.query("INSERT INTO master_records(master_name,record_data) VALUES('Users & employees',$1)",[JSON.stringify({...user,login:'OTHER'})]),error=>error.code==='23505');
 }finally{await db.close();}
});
