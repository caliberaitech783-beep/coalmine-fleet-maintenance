import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {initializeSingleLogin} from '../single-login.mjs';
import {installPulseApplicationIdentity} from '../pulse-application-identity.mjs';
import {installCaliberOneSignIn,HR_ORIGIN} from '../caliber-one-signin.mjs';
import {createSessionStore} from '../auth-session.mjs';
import {protectDeletionPool} from '../deletion-approval.mjs';
import {hashPassword} from '../password-auth.mjs';
import {frameUrl,appByKey,preloadMayStart} from '../public/one/one-tabs.mjs';

// Owner, 28 Nov 2026: "taking lot of time". MIS, HR Pulse and Diesel send a person to Pulse's home
// page for a sign-in; that opened the whole Pulse app in each tab (9 start-up requests each, four
// Pulse apps at once). A person whose Pulse sign-in is in the browser is now sent straight on by the
// server, with the same access rules and one-time codes; everyone else gets the app as before.
const state='s'.repeat(43),verifier='v'.repeat(43),challenge=createHash('sha256').update(verifier).digest('base64url');
const COOKIE='__Host-pulse_mis_signin';
const admin={login:'owner',employee:'Owner',userType:'Super Admin',adminLevel:'Admin',passwordHash:hashPassword('pw-owner-1')};
const clerk={login:'clerk',employee:'Clerk',userType:'Mobile User',userRoles:'Production User',passwordHash:hashPassword('pw-clerk-1')};

async function world(){
 const db=new PGlite();
 await db.exec("CREATE TABLE app_metadata(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE master_records(id BIGSERIAL PRIMARY KEY,master_name TEXT,record_data JSONB,created_at TIMESTAMPTZ DEFAULT NOW());CREATE TABLE auth_sessions(token UUID PRIMARY KEY,role TEXT,employee_name TEXT,login_name TEXT,user_type TEXT,assigned_role TEXT,permissions JSONB,created_at TIMESTAMPTZ DEFAULT NOW(),last_seen_at TIMESTAMPTZ DEFAULT NOW(),session_public_id TEXT UNIQUE DEFAULT gen_random_uuid()::text);");
 const pool=protectDeletionPool({query:(sql,params)=>sql.split(';').filter(x=>x.trim()).length>1?db.exec(sql):db.query(sql,params)});
 await initializeSingleLogin(pool);
 const routes=new Map();
 const app={post:(url,...handlers)=>routes.set('POST '+url,handlers),get:(url,...handlers)=>routes.set('GET '+url,handlers),options(){}};
 const sessionStore=createSessionStore(pool);
 const identity=installPulseApplicationIdentity(app,{pool,sessionStore});
 await identity.initialize();
 const rules={locationOwed:false,membershipOwed:false,diesel:'https://pulse-lll.cmll.in/api/sign-in/callback?code=x'},asked=[];
 const caliber=installCaliberOneSignIn(app,{pool,identity,sessionStore,sessionCookie:COOKIE,
  requireSession:(_req,res)=>res.status(401).json({error:'not used here'}),
  misRedirectFor:async({state:s,grant})=>`https://pulse-ll.cmll.in/api/mis-credentials/callback?code=${'k'.repeat(43)}&state=${s}#${grant}`,
  readSession:async req=>{asked.push(req.path);if(rules.membershipOwed)throw Object.assign(new Error('Join the Telegram groups'),{status:403});return sessionStore.get(String(req.headers.authorization||'').replace(/^Bearer\s+/i,''));},
  checkLocation:async(_req,res)=>{if(!rules.locationOwed)return false;res.status(428).json({error:'location'});return true;},
  dieselRedirect:async(s,c,token)=>rules.diesel&&`${rules.diesel}&state=${s}&for=${token}`});
 await caliber.initialize();
 for(const user of [admin,clerk])await db.query("INSERT INTO master_records(master_name,record_data) VALUES('Users & employees',$1)",[JSON.stringify(user)]);
 const signIn=async(login='owner')=>{const token=randomUUID();await sessionStore.create({token,role:'super',name:login,login,userType:'x',assignedRole:'',permissions:{}});return token;};
 // GET / as a browser tab sends it: the request in the address, the sign-in in the cookie.
 const open=async(query,token)=>{
  let redirect=null,passedOn=false;
  const res={set(){return res;},redirect(status,url){redirect={status,url};}};
  await routes.get('GET /')[0]({query,headers:token?{cookie:`theme=dark; ${COOKIE}=${token}`}:{}},res,()=>{passedOn=true;});
  return {redirect,passedOn};
 };
 const post=async(route,body,origin)=>{let status=200,value;const res={set(){return res;},vary(){},status(code){status=code;return res;},json(data){value=data;return res;},end(){return res;}};
  for(const handler of routes.get(route)){let advanced=false;await handler({body,method:'POST',headers:origin?{origin}:{},ip:'127.0.0.1'},res,error=>{if(error)throw error;advanced=true;});if(!advanced)break;}return {status,value};};
 return {db,open,post,signIn,rules,asked};
}
const mis={login:'mis',misState:state,misChallenge:challenge},hr={hrSignIn:'1',state,code_challenge:challenge},diesel={dieselSignIn:'1',state,code_challenge:challenge};

test('a person signed in to Pulse is sent straight on to MIS, HR Pulse and Diesel',async()=>{
 const {db,open,post,signIn,asked}=await world();
 try{
  const pulse=await signIn();
  const toMis=await open(mis,pulse);
  assert.equal(toMis.redirect.status,303);
  assert.match(toMis.redirect.url,/^https:\/\/pulse-ll\.cmll\.in\/api\/mis-credentials\/callback\?code=k{43}&state=s{43}#/);
  assert.equal((await post('POST /api/integrations/mis/validate',{grant:toMis.redirect.url.split('#')[1]})).status,200,'a real MIS grant, as the app issued');
  assert.deepEqual(asked,['/api/caliber-one/handoff'],'read on the sign-in pool, like Diesel');

  const toHr=await open(hr,pulse);
  const target=new URL(toHr.redirect.url);
  assert.equal(target.origin+target.pathname,HR_ORIGIN+'/');
  assert.equal(target.searchParams.get('hrState'),state);
  const swapped=await post('POST /api/integrations/hr/exchange',{code:target.searchParams.get('hrCode'),state,verifier},HR_ORIGIN);
  assert.equal(swapped.status,200);
  assert.equal(swapped.value.profile.permissions.application,'HR');

  const toDiesel=await open(diesel,pulse);
  assert.equal(toDiesel.redirect.url,`https://pulse-lll.cmll.in/api/sign-in/callback?code=x&state=${state}&for=${pulse}`);

  const {rows}=await db.query('SELECT application FROM caliber_one_signins WHERE parent_session=$1 ORDER BY application',[pulse]);
  assert.deepEqual(rows.map(row=>row.application),['HR','MIS'],'a sign-out anywhere still finds what this sign-in opened');
 }finally{await db.close();}
});

test('access rules are unchanged: no HR access goes back to HR Pulse, no MIS access is told by the app',async()=>{
 const {db,open,signIn}=await world();
 try{
  const pulse=await signIn('clerk');
  assert.deepEqual((await open(hr,pulse)).redirect,{status:303,url:HR_ORIGIN+'/?hrSso=noaccess'});
  assert.deepEqual(await open(mis,pulse),{redirect:null,passedOn:true});
  const {rows}=await db.query('SELECT 1 FROM application_identity_grants');
  assert.equal(rows.length,0,'no grant for a person without access');
 }finally{await db.close();}
});

test('everyone else, and every other address, gets the Pulse app as before',async()=>{
 const {db,open,signIn,rules}=await world();
 try{
  const pulse=await signIn();
  const app={redirect:null,passedOn:true};
  assert.deepEqual(await open(mis,''),app,'no sign-in in the browser');
  assert.deepEqual(await open(mis,randomUUID()),app,'a sign-in that has ended');
  assert.deepEqual(await open(mis,'not-a-token'),app);
  assert.deepEqual(await open({},pulse),app,'Pulse itself');
  assert.deepEqual(await open({login:'mis'},pulse),app,'the MIS sign-in form');
  assert.deepEqual(await open({...mis,misManual:'1'},pulse),app,'Sign in to MIS another way');
  assert.deepEqual(await open({...mis,misState:'short'},pulse),app);
  assert.deepEqual(await open({...mis,misState:[state,state]},pulse),app);
  assert.deepEqual(await open({...hr,hrSignIn:'0'},pulse),app);
  rules.locationOwed=true;
  assert.deepEqual(await open(mis,pulse),app,'location still owed: the app asks for it');
  rules.locationOwed=false;rules.membershipOwed=true;
  assert.deepEqual(await open(hr,pulse),app,'a sign-in rule still open: the app shows it');
  rules.membershipOwed=false;rules.diesel='';
  assert.deepEqual(await open(diesel,pulse),app,'Diesel sign-in switched off');
  const {rows}=await db.query('SELECT 1 FROM application_identity_grants');
  assert.equal(rows.length,0,'none of these issued a grant');
 }finally{await db.close();}
});

test('the window opens the tab in view first and MIS at its sign-in step after a fresh sign-in',()=>{
 assert.equal(frameUrl(appByKey('mis'),{justSignedIn:true}),'https://pulse-ll.cmll.in/api/mis-credentials/start');
 assert.equal(frameUrl(appByKey('mis')),'https://pulse-ll.cmll.in/','reopened already signed in: MIS keeps its own sign-in');
 assert.equal(frameUrl(appByKey('hr'),{justSignedIn:true}),'https://hrpulse.cmll.in/?hrSso=start');
 assert.equal(frameUrl(appByKey('diesel'),{justSignedIn:true}),'https://pulse-lll.cmll.in/');
 assert.equal(preloadMayStart({now:10_000,lastLoadAt:9_000,waitingSince:5_000}),false,'a tab finished a page a second ago: wait');
 assert.equal(preloadMayStart({now:10_000,lastLoadAt:7_500,waitingSince:5_000}),true,'quiet for two seconds: load the next tab');
 assert.equal(preloadMayStart({now:25_000,lastLoadAt:24_500,waitingSince:9_000}),true,'never wait more than 15 seconds');
 const read=path=>readFileSync(new URL(path,import.meta.url),'utf8').replace(/\r\n/g,'\n');
 const script=read('../public/one/one.js'),server=read('../server.mjs');
 assert.match(script,/if \(!preloadMayStart\(\{ now: Date\.now\(\), lastLoadAt, waitingSince \}\)\) \{ setTimeout\(next, 500\); return; \}/);
 assert.match(script,/frame\.src = frameUrl\(app, \{ justSignedIn \}\);/);
 assert.match(server,/readSession,checkLocation:signInLocationGuard,sessionCookie:pulseSsoSessionCookie,/);
 assert.match(server,/const dieselSignIn=req\.path\.startsWith\('\/api\/diesel-sso\/'\)\|\|req\.path\.startsWith\('\/api\/caliber-one\/'\);/);
});
