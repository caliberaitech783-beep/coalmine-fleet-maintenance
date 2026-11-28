import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {initializeSingleLogin} from '../single-login.mjs';
import {installPulseApplicationIdentity} from '../pulse-application-identity.mjs';
import {createSessionStore} from '../auth-session.mjs';
import {hashPassword} from '../password-auth.mjs';

// Caliber One (owner, 28 Nov 2026): the HR grant opened from a Pulse sign-in rides on that Pulse
// session. It must never end the person's HR sign-in on another screen (one HR session per login),
// or the two HR screens sign each other out round and round (seen live on 28 Nov 2026).
const password='existing-pulse-password';
const user={login:'FLEET.ONE',employee:'Person',userType:'Mobile User',userRoles:'Production User',passwordHash:hashPassword(password),hrAccess:true,hrDesktopAccess:['Dashboard'],hrMobileAccess:['Holiday & Leave'],hrAccountStatus:'Active'};

test('an HR grant on the Pulse session leaves other HR sign-ins alone and ends with Pulse',async()=>{
 const db=new PGlite();
 try{
  await db.exec("CREATE TABLE app_metadata(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE master_records(id BIGSERIAL PRIMARY KEY,master_name TEXT,record_data JSONB);CREATE TABLE auth_sessions(token UUID PRIMARY KEY,role TEXT,employee_name TEXT,login_name TEXT,user_type TEXT,assigned_role TEXT,permissions JSONB,created_at TIMESTAMPTZ DEFAULT NOW(),last_seen_at TIMESTAMPTZ DEFAULT NOW(),session_public_id TEXT UNIQUE DEFAULT gen_random_uuid()::text);");
  const pool={query:(sql,params)=>sql.split(';').filter(x=>x.trim()).length>1?db.exec(sql):db.query(sql,params)};
  await initializeSingleLogin(pool);
  const routes=new Map();
  const sessionStore=createSessionStore(pool);
  const identity=installPulseApplicationIdentity({post:(url,handler)=>routes.set(url,handler),options:()=>{}},{pool,sessionStore});
  await identity.initialize();
  await db.query("INSERT INTO master_records(master_name,record_data) VALUES('Users & employees',$1)",[JSON.stringify(user)]);
  const {rows:[row]}=await db.query('SELECT id,record_data FROM master_records WHERE id=1');
  const call=async(action,body)=>{
   let status=200,value;const res={set(){},vary(){},status(code){status=code;return this},json(data){value=data},end(){}};
   await routes.get('/api/integrations/hr/'+action)({body,method:'POST',headers:{origin:'https://hrpulse.cmll.in'},ip:'127.0.0.1'},res,error=>{throw error});
   return {status,value};
  };
  const pulseSession=async()=>{const token=randomUUID();await sessionStore.create({token,role:'normal',name:'Person',login:'FLEET.ONE',userType:'Mobile User',assignedRole:'Production User',permissions:{}});return token;};

  const hrScreen=await call('authenticate',{username:'FLEET.ONE',password});
  assert.equal(hrScreen.status,200,'HR Pulse signed in with the password on another screen');
  const pulse=await pulseSession();
  const {grant}=await identity.attachPulseSessionGrant(row,'HR',pulse);
  assert.equal((await call('validate',{grant})).value.profile.permissions.application,'HR','the Caliber One HR tab is in');
  assert.equal((await call('validate',{grant:hrScreen.value.grant})).status,200,'the other HR screen stays signed in');
  const {rows:hrSessions}=await db.query("SELECT 1 FROM auth_sessions WHERE permissions->>'application'='HR'");
  assert.equal(hrSessions.length,1,'no new HR session was started');

  assert.equal((await call('logout',{grant})).status,200);
  assert.equal((await call('validate',{grant})).status,401,'HR sign out ends the tab’s HR grant');
  const {rows:still}=await db.query('SELECT 1 FROM auth_sessions WHERE token=$1',[pulse]);
  assert.equal(still.length,1,'HR sign out does not sign out of Pulse');

  const again=(await identity.attachPulseSessionGrant(row,'HR',pulse)).grant;
  await pulseSession();
  assert.equal((await call('validate',{grant:again})).status,401,'a Pulse sign-in elsewhere ends it, like Diesel');
  const fresh=await pulseSession();
  const third=(await identity.attachPulseSessionGrant(row,'HR',fresh)).grant;
  await db.query('DELETE FROM auth_sessions WHERE token=$1',[fresh]);
  assert.equal((await call('validate',{grant:third})).status,401,'Pulse sign out ends it');

  const old=await pulseSession();
  await db.query("UPDATE auth_sessions SET created_at=NOW()-INTERVAL '8 days' WHERE token=$1",[old]);
  const stale=(await identity.attachPulseSessionGrant(row,'HR',old)).grant;
  assert.equal((await call('validate',{grant:stale})).status,401,'never longer than the Pulse sign-in’s 7 days');

  await assert.rejects(identity.attachPulseSessionGrant(row,'HR',randomUUID()),/Pulse sign-in expired/);
  const mis=randomUUID();await sessionStore.create({token:mis,role:'super',name:'Person',login:'FLEET.ONE',permissions:{application:'MIS'}});
  await assert.rejects(identity.attachPulseSessionGrant(row,'HR',mis),/Pulse sign-in expired/,'only a Pulse sign-in, not an MIS one');
  await db.query("UPDATE master_records SET record_data=record_data||'{\"hrAccess\":false}' WHERE id=1");
  const noAccess=await pulseSession();
  const revoked=(await identity.attachPulseSessionGrant(row,'HR',noAccess)).grant;
  assert.equal((await call('validate',{grant:revoked})).status,401,'HR access is checked on every use');
 }finally{await db.close();}
});
