import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import express from 'express';
import {PGlite} from '@electric-sql/pglite';
import {initializeSingleLogin} from '../single-login.mjs';
import {installPulseApplicationIdentity} from '../pulse-application-identity.mjs';
import {installCaliberOneSignIn} from '../caliber-one-signin.mjs';
import {registerDieselSharedSignIn} from '../diesel-shared-signin.mjs';
import {createSessionStore} from '../auth-session.mjs';
import {protectDeletionPool} from '../deletion-approval.mjs';
import {hashPassword} from '../password-auth.mjs';
import {frameUrl,appByKey} from '../public/one/one-tabs.mjs';

// Owner, 28 Nov 2026: "there is no need for sign out of all. If a person signs out, it will sign out
// from all." A sign-out in Pulse, MIS, HR Pulse or Diesel ends the Pulse sign-in and every sign-in it
// opened; a sign-in that Pulse did not open (MIS with its own password) ends only itself.
const password='existing-pulse-password';
const admin={login:'owner',employee:'Owner',userType:'Super Admin',adminLevel:'Admin',passwordHash:hashPassword(password)};
const state='s'.repeat(43),verifier='v'.repeat(43),challenge=createHash('sha256').update(verifier).digest('base64url');

async function world(){
 const db=new PGlite();
 await db.exec("CREATE TABLE app_metadata(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE master_records(id BIGSERIAL PRIMARY KEY,master_name TEXT,record_data JSONB,created_at TIMESTAMPTZ DEFAULT NOW());CREATE TABLE auth_sessions(token UUID PRIMARY KEY,role TEXT,employee_name TEXT,login_name TEXT,user_type TEXT,assigned_role TEXT,permissions JSONB,created_at TIMESTAMPTZ DEFAULT NOW(),last_seen_at TIMESTAMPTZ DEFAULT NOW(),session_public_id TEXT UNIQUE DEFAULT gen_random_uuid()::text);");
 // The production pools are guarded: sign-in records must stay deletable through the guard.
 const pool=protectDeletionPool({query:(sql,params)=>sql.split(';').filter(x=>x.trim()).length>1?db.exec(sql):db.query(sql,params)});
 await initializeSingleLogin(pool);
 const routes=new Map();
 const app={post:(url,...handlers)=>routes.set('POST '+url,handlers),get:(url,...handlers)=>routes.set('GET '+url,handlers),options(){}};
 const sessionStore=createSessionStore(pool);
 const identity=installPulseApplicationIdentity(app,{pool,sessionStore});
 await identity.initialize();
 let misGrant='';
 const requireSession=async(req,res,next)=>{const session=await sessionStore.get(String(req.headers.authorization||'').replace(/^Bearer\s+/i,''));if(!session)return res.status(401).json({error:'expired'});req.session=session;next();};
 const caliber=installCaliberOneSignIn(app,{pool,requireSession,identity,sessionStore,misRedirectFor:async({grant})=>{misGrant=grant;return 'https://pulse-ll.cmll.in/api/mis-credentials/callback';}});
 await caliber.initialize();
 await db.query("INSERT INTO master_records(master_name,record_data) VALUES('Users & employees',$1)",[JSON.stringify(admin)]);
 const call=async(route,{body={},token='',origin}={})=>{
  let status=200,value;
  const res={set(){return res;},vary(){},status(code){status=code;return res;},json(data){value=data;return res;},end(){return res;}};
  const req={body,method:route.split(' ')[0],headers:{...(token?{authorization:'Bearer '+token}:{}),...(origin?{origin}:{})},ip:'127.0.0.1'};
  const handlers=routes.get(route);
  for(const handler of handlers){let advanced=false;await handler(req,res,error=>{if(error)throw error;advanced=true;});if(!advanced)break;}
  return {status,value};
 };
 const pulseSignIn=async()=>{const token=randomUUID();await sessionStore.create({token,role:'super',name:'Owner',login:'owner',userType:'Super Admin',assignedRole:'',permissions:{adminLevel:'Admin'}});return token;};
 // Opens MIS and HR Pulse from a Pulse sign-in, as the Caliber One tabs do.
 const openTabs=async pulse=>{
  assert.equal((await call('POST /api/mis-login/continue',{token:pulse,body:{state,challenge}})).status,200);
  const mis=misGrant;
  assert.equal((await call('POST /api/hr-login/continue',{token:pulse,body:{state,challenge}})).status,200);
  const {rows}=await db.query('SELECT grant_token FROM caliber_one_codes ORDER BY expires_at DESC LIMIT 1');
  return {mis,hr:rows[0].grant_token};
 };
 const alive={
  pulse:async token=>(await call('GET /api/caliber-one/session',{token})).value.signedIn,
  mis:async grant=>(await call('POST /api/integrations/mis/validate',{body:{grant}})).status===200,
  hr:async grant=>(await call('POST /api/integrations/hr/validate',{body:{grant},origin:'https://hrpulse.cmll.in'})).status===200,
 };
 return {db,pool,call,pulseSignIn,openTabs,alive,caliber,identity};
}

test('signing out in MIS, in HR Pulse or in Pulse signs out of all three',async()=>{
 const {db,call,pulseSignIn,openTabs,alive,caliber}=await world();
 try{
  for(const where of ['mis','hr','pulse','diesel']){
   const pulse=await pulseSignIn();
   const tabs=await openTabs(pulse);
   assert.deepEqual([await alive.pulse(pulse),await alive.mis(tabs.mis),await alive.hr(tabs.hr)],[true,true,true],`${where}: all open after one sign-in`);
   if(where==='mis')await call('POST /api/integrations/mis/logout',{body:{grant:tabs.mis}});
   if(where==='hr')await call('POST /api/integrations/hr/logout',{body:{grant:tabs.hr},origin:'https://hrpulse.cmll.in'});
   // Pulse's own Sign out: /api/logout ends what the sign-in opened, then the sign-in itself.
   if(where==='pulse'){await caliber.endOpened(pulse);await db.query('DELETE FROM auth_sessions WHERE token=$1',[pulse]);}
   // Diesel's Sign out reaches Pulse as onSignOut (see the Diesel test below).
   if(where==='diesel')await caliber.endPulseSignIn(pulse);
   assert.deepEqual([await alive.pulse(pulse),await alive.mis(tabs.mis),await alive.hr(tabs.hr)],[false,false,false],`a sign-out in ${where} signs out of all`);
  }
 }finally{await db.close();}
});

test('a sign-in Pulse did not open ends only itself, and another computer stays signed in',async()=>{
 const {db,call,pulseSignIn,openTabs,alive}=await world();
 try{
  await db.query("INSERT INTO session_limit_exceptions(login,max_sessions) VALUES('owner',3) ON CONFLICT(login) DO UPDATE SET max_sessions=3");
  const here=await pulseSignIn(),there=await pulseSignIn();
  const hereTabs=await openTabs(here),thereTabs=await openTabs(there);
  const own=(await call('POST /api/integrations/mis/authenticate',{body:{username:'owner',password}})).value.grant;
  assert.ok(await alive.mis(own));
  await call('POST /api/integrations/mis/logout',{body:{grant:own}});
  assert.equal(await alive.mis(own),false);
  assert.deepEqual([await alive.pulse(here),await alive.mis(hereTabs.mis),await alive.hr(hereTabs.hr)],[true,true,true],'MIS signed in with its own password signs out alone');
  await call('POST /api/integrations/hr/logout',{body:{grant:hereTabs.hr},origin:'https://hrpulse.cmll.in'});
  assert.deepEqual([await alive.pulse(here),await alive.mis(hereTabs.mis)],[false,false]);
  assert.deepEqual([await alive.pulse(there),await alive.mis(thereTabs.mis),await alive.hr(thereTabs.hr)],[true,true,true],'the other computer stays signed in');
  assert.equal(await alive.pulse('not-a-token'),false);
  assert.equal(await alive.pulse(''),false);
 }finally{await db.close();}
});

test('Diesel signs Pulse out only when the person pressed Sign out there',async()=>{
 const database=new PGlite(),app=express();
 app.use(express.json());
 const secret='s'.repeat(43),signedOut=[];
 const issuer=registerDieselSharedSignIn(app,{pool:protectDeletionPool(database),secret,enabled:'1',requireSession:(_q,_s,next)=>next(),readSession:async()=>null,checkLocation:async()=>false,onSignOut:async token=>{signedOut.push(token);}});
 await issuer.initialize();
 const server=app.listen(0,'127.0.0.1');
 try{
  await once(server,'listening');
  const digest=value=>createHash('sha256').update(value).digest('base64url');
  const revoke=body=>fetch('http://127.0.0.1:'+server.address().port+'/api/diesel-sso/revoke',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+secret},body:JSON.stringify(body)});
  const grant=async()=>{const value=randomUUID().replaceAll('-','').padEnd(43,'g'),session=randomUUID();
   await database.query("INSERT INTO diesel_sso(code_hash,state,challenge,session_token,code_expires_at,grant_hash,grant_expires_at) VALUES($1,'s','c',$2,now(),$3,now()+interval '8 hours')",[randomUUID(),session,digest(value)]);return {value,session};};
  const refused=await grant();
  assert.equal((await revoke({grant:refused.value})).status,204);
  assert.deepEqual(signedOut,[],'a grant Diesel drops for lack of access leaves the Pulse sign-in alone');
  const pressed=await grant();
  assert.equal((await revoke({grant:pressed.value,signOut:true})).status,204);
  assert.deepEqual(signedOut,[pressed.session]);
  assert.equal((await revoke({grant:pressed.value,signOut:true})).status,204);
  assert.equal(signedOut.length,1,'a grant already gone signs nobody out');
 }finally{server.close();server.closeAllConnections();await database.close();}
});

test('the window has one sign-in for every tab and no Sign out all button',()=>{
 const read=path=>readFileSync(new URL(path,import.meta.url),'utf8').replace(/\r\n/g,'\n');
 const page=read('../public/one/index.html'),script=read('../public/one/one.js'),main=read('../src/main.jsx'),styles=read('../src/user-sessions.css'),server=read('../server.mjs');
 assert.doesNotMatch(page,/one-signout|Sign out all|one-waiting|Open without Pulse/);
 assert.match(page,/<p class="one-hint" role="status" hidden>Sign in once here\./);
 assert.match(script,/const shown = signedIn \? key : 'pulse';/,'signed out, every tab shows the one sign-in');
 assert.match(script,/\} else if \(!token\) \{\n      \/\/ Signed out in the Pulse tab\.\n      await leave\(\);/);
 assert.match(script,/if \(await ended\(token\)\) await leave\(\);/);
 assert.match(script,/if \(!response\.ok\) return false;\n      return \(await response\.json\(\)\)\.signedIn === false;\n    \} catch \{ return false; \}/,'only a clear no signs out; a failed answer changes nothing');
 assert.equal(frameUrl(appByKey('hr')),'https://hrpulse.cmll.in/?hrSso=start','HR Pulse opens with the Pulse sign-in, also after a sign-out');
 assert.equal(frameUrl(appByKey('mis')),'https://pulse-ll.cmll.in/');
 assert.match(main,/if \(window\.name === 'caliber-one-pulse'\) document\.documentElement\.classList\.add\('in-caliber-one'\);/);
 assert.match(styles,/\.in-caliber-one \.login-tender-link,\.in-caliber-one \.login-mis-link,\.in-caliber-one \.login-hr-link,\.in-caliber-one \.login-diesel-link\{display:none!important\}/);
 assert.match(server,/await caliberOneSignIn\.endOpened\(token\)[^\n]*\n\s+await pool\.query\('DELETE FROM auth_sessions WHERE token=\$1',\[token\]\);/,'Pulse Sign out ends what it opened');
 assert.match(server,/onSignOut:token=>caliberOneSignIn\.endPulseSignIn\(token\),/);
});
