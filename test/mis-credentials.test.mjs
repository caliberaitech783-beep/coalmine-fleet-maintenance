import {initializeSingleLogin} from '../single-login.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createHash,randomBytes} from 'node:crypto';
import {prepareMisCredentials} from '../mis-credentials.mjs';
import {installPulseApplicationIdentity} from '../pulse-application-identity.mjs';
import {installMisLoginHandoff} from '../mis-login-handoff.mjs';
import {hashPassword} from '../password-auth.mjs';
import {createSessionStore} from '../auth-session.mjs';
test('MIS entitlement uses Pulse credentials and strips obsolete separate secrets',()=>{
 const record=prepareMisCredentials({misAccess:true,login:'anoop',passwordHash:'pulse-hash',misLogin:'old',misPassword:'old',misPasswordHash:'old',misDesktopAccess:['Dashboard','invalid']});
 assert.equal(record.passwordHash,'pulse-hash');assert.equal(record.misLogin,undefined);assert.equal(record.misPasswordHash,undefined);assert.equal(record.misPassword,undefined);assert.deepEqual(record.misDesktopAccess,['Dashboard']);
});
test('shared Pulse password, per-application authorization, revocation, rate limits and one-time handoff',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE app_metadata(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE master_records(id BIGSERIAL PRIMARY KEY,master_name TEXT,record_data JSONB);CREATE TABLE auth_sessions(token UUID PRIMARY KEY,role TEXT,employee_name TEXT,login_name TEXT,user_type TEXT,assigned_role TEXT,permissions JSONB,created_at TIMESTAMPTZ DEFAULT NOW(),last_seen_at TIMESTAMPTZ DEFAULT NOW(),session_public_id TEXT UNIQUE DEFAULT gen_random_uuid()::text);`);
 const pool={query:(sql,params)=>sql.split(';').filter(x=>x.trim()).length>1?db.exec(sql):db.query(sql,params)};
 await initializeSingleLogin(pool);
 const routes=new Map(),app={post:(url,fn)=>routes.set(url,fn),options(){}};
 const identity=installPulseApplicationIdentity(app,{pool,sessionStore:createSessionStore(pool)});await identity.initialize();
 const handoff=installMisLoginHandoff(app,{pool,identity});await handoff.initialize();
 let user={login:'anoop',employee:'Person',userType:'Mobile User',userRoles:'HR User',passwordHash:hashPassword('pulse-test-password'),misAccess:true,misDesktopAccess:['Dashboard'],hrAccess:true,hrLogin:'hr.anoop',hrPasswordHash:hashPassword('independent-hr-password'),hrDesktopAccess:['Dashboard']};
 await db.query("INSERT INTO master_records(master_name,record_data) VALUES('Users & employees',$1)",[JSON.stringify(user)]);
 const call=async(path,body,headers={})=>{let value;const res={statusCode:200,set(){return this},status(code){this.statusCode=code;return this},json(data){value=data;return this}};await routes.get(path)({body,headers,ip:'127.0.0.1'},res,e=>{throw e});return {status:res.statusCode,value}};
 const credentials={username:'anoop',password:'pulse-test-password'};
 assert.equal((await call('/api/integrations/mis/authenticate',{...credentials,password:'wrong'})).status,401);
 const hrCredentials={...credentials};
 const mis=await call('/api/integrations/mis/authenticate',credentials),hr=await call('/api/integrations/hr/authenticate',hrCredentials,{origin:'https://hrpulse.cmll.in'});
 assert.equal(mis.status,200);assert.equal(hr.status,200);assert.equal((await call('/api/integrations/mis/validate',{grant:mis.value.grant})).status,200,'HR login must not replace an authorized MIS login');assert.equal(hr.value.profile.login,'anoop');
 assert.equal((await call('/api/integrations/hr/authenticate',credentials,{origin:'https://untrusted.example'})).status,403);
 assert.equal((await call('/api/integrations/hr/validate',{grant:mis.value.grant})).status,401);
 for(const row of (await db.query('SELECT token FROM auth_sessions')).rows)assert.equal(await createSessionStore(pool).get(row.token),null);
 const linked=await call('/api/integrations/mis/open-hr',{grant:mis.value.grant});
 assert.equal(linked.status,200);
 assert.equal(linked.value.profile.permissions.application,'HR');
 assert.equal((await call('/api/integrations/hr/validate',{grant:linked.value.grant})).status,200);
 assert.equal((await call('/api/integrations/mis/validate',{grant:linked.value.grant})).status,401);
 await call('/api/integrations/hr/logout',{grant:linked.value.grant});
 assert.equal((await call('/api/integrations/mis/validate',{grant:mis.value.grant})).status,200);
 const after=await call('/api/integrations/mis/open-hr',{grant:mis.value.grant});
 assert.equal(after.status,200);
 await call('/api/integrations/mis/logout',{grant:mis.value.grant});
 assert.equal((await call('/api/integrations/hr/validate',{grant:after.value.grant})).status,401);
 assert.equal((await call('/api/integrations/mis/open-hr',{grant:mis.value.grant})).status,401);
 const verifier=randomBytes(32).toString('base64url'),state=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
 const authorized=await call('/api/mis-login/authorize',{...credentials,state,challenge});assert.equal(authorized.status,200);assert.equal(authorized.value.grant,undefined);
 const target=new URL(authorized.value.redirectUrl);assert.equal(target.origin,'https://pulse-ll.cmll.in');const code=target.searchParams.get('code');
 assert.equal((await call('/api/integrations/mis/exchange',{code,state,verifier:state})).status,401);
 const completed=await call('/api/integrations/mis/exchange',{code,state,verifier});assert.equal(completed.status,200);const currentGrant=completed.value.grant;
 assert.equal((await call('/api/integrations/mis/exchange',{code,state,verifier})).status,401);
 user.misDesktopAccess=[];await db.query('UPDATE master_records SET record_data=$1',[JSON.stringify(user)]);assert.deepEqual((await call('/api/integrations/mis/validate',{grant:currentGrant})).value.profile.permissions.misDesktopAccess,[]);
 user.passwordHash=hashPassword('changed-pulse-password');await db.query('UPDATE master_records SET record_data=$1',[JSON.stringify(user)]);
 for(const [application,grant] of [['mis',mis.value.grant],['hr',hr.value.grant]])assert.equal((await call(`/api/integrations/${application}/validate`,{grant})).status,401);
 hrCredentials.password='changed-pulse-password';
 const again=await call('/api/integrations/hr/authenticate',hrCredentials);assert.equal(again.status,200);await call('/api/integrations/hr/logout',{grant:again.value.grant});assert.equal((await call('/api/integrations/hr/validate',{grant:again.value.grant})).status,401);
 user.hrAccess=false;await db.query('UPDATE master_records SET record_data=$1',[JSON.stringify(user)]);assert.equal((await call('/api/integrations/hr/authenticate',hrCredentials)).status,403);
 for(let i=0;i<10;i++)await call('/api/integrations/mis/authenticate',{username:'missing',password:'wrong'});assert.equal((await call('/api/integrations/mis/authenticate',{username:'missing',password:'wrong'})).status,429);
 }finally{await db.close()}
});

test('Remember me on the MIS sign-in gives a 40-day grant and tells Pulse-II; without it the grant stays 7 days',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE app_metadata(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE master_records(id BIGSERIAL PRIMARY KEY,master_name TEXT,record_data JSONB);CREATE TABLE auth_sessions(token UUID PRIMARY KEY,role TEXT,employee_name TEXT,login_name TEXT,user_type TEXT,assigned_role TEXT,permissions JSONB,created_at TIMESTAMPTZ DEFAULT NOW(),last_seen_at TIMESTAMPTZ DEFAULT NOW(),session_public_id TEXT UNIQUE DEFAULT gen_random_uuid()::text);`);
 const pool={query:(sql,params)=>sql.split(';').filter(x=>x.trim()).length>1?db.exec(sql):db.query(sql,params)};
 await initializeSingleLogin(pool);
 const routes=new Map(),app={post:(url,fn)=>routes.set(url,fn),options(){}};
 const identity=installPulseApplicationIdentity(app,{pool,sessionStore:createSessionStore(pool)});await identity.initialize();
 const handoff=installMisLoginHandoff(app,{pool,identity});await handoff.initialize();
 await db.query("INSERT INTO master_records(master_name,record_data) VALUES('Users & employees',$1)",[JSON.stringify({login:'owner',employee:'Person',userType:'Mobile User',passwordHash:hashPassword('pulse-test-password'),misAccess:true,misDesktopAccess:['Dashboard']})]);
 await db.query("INSERT INTO master_records(master_name,record_data) VALUES('Users & employees',$1)",[JSON.stringify({login:'MohitChadda',employee:'Owner',userType:'Mobile User',passwordHash:hashPassword('pulse-test-password'),misAccess:true,misDesktopAccess:['Dashboard']})]);
 const call=async(path,body)=>{let value;const res={statusCode:200,set(){return this},status(code){this.statusCode=code;return this},json(data){value=data;return this}};await routes.get(path)({body,headers:{},ip:'127.0.0.1'},res,e=>{throw e});return {status:res.statusCode,value}};
 const signIn=async(remember,username='owner')=>{
  const verifier=randomBytes(32).toString('base64url'),state=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
  const authorized=await call('/api/mis-login/authorize',{username,password:'pulse-test-password',state,challenge,...(remember===undefined?{}:{remember})});assert.equal(authorized.status,200);
  const code=new URL(authorized.value.redirectUrl).searchParams.get('code');
  const completed=await call('/api/integrations/mis/exchange',{code,state,verifier});assert.equal(completed.status,200);
  const {rows}=await db.query("SELECT ROUND(EXTRACT(EPOCH FROM expires_at-NOW())/86400) AS days FROM application_identity_grants ORDER BY expires_at DESC LIMIT 1");
  return {remember:completed.value.remember,days:Number(rows[0].days),grant:completed.value.grant};
 };
 for(const value of [undefined,false,'true'])assert.deepEqual((({remember,days})=>({remember,days}))(await signIn(value)),{remember:false,days:7});
 const kept=await signIn(true);assert.equal(kept.remember,true);assert.equal(kept.days,40);
 // The owner's MIS grant lasts 40 days even without the tick.
 assert.equal((await signIn(undefined,'mohitchadda')).days,40);
 // A remembered sign-in stays valid after its Pulse session passes 7 days; an ordinary one does not.
 await db.query("UPDATE auth_sessions SET created_at=NOW()-INTERVAL '35 days'");
 assert.equal((await call('/api/integrations/mis/validate',{grant:kept.grant})).status,200);
 await db.query("UPDATE application_identity_grants SET expires_at=NOW()-INTERVAL '1 second'");
 assert.equal((await call('/api/integrations/mis/validate',{grant:kept.grant})).status,401);
 }finally{await db.close()}
});
