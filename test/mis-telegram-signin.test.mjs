import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createHash,randomBytes} from 'node:crypto';
import {initializeSingleLogin} from '../single-login.mjs';
import {installPulseApplicationIdentity} from '../pulse-application-identity.mjs';
import {installMisLoginHandoff,MIS_TELEGRAM_CODE_ATTEMPTS,MIS_TELEGRAM_CODES_PER_HOUR} from '../mis-login-handoff.mjs';
import {hashPassword,verifyPassword} from '../password-auth.mjs';
import {createSessionStore} from '../auth-session.mjs';
import {loginRecordCandidates} from '../mobile-access.mjs';

// MIS sign-in with a 6-digit code sent to the person's own Telegram chat, instead of the password.
async function harness({chats={owner:'111'},sendFails=false}={}){
 const db=new PGlite();
 await db.exec(`CREATE TABLE app_metadata(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE master_records(id BIGSERIAL PRIMARY KEY,master_name TEXT,record_data JSONB);CREATE TABLE auth_sessions(token UUID PRIMARY KEY,role TEXT,employee_name TEXT,login_name TEXT,user_type TEXT,assigned_role TEXT,permissions JSONB,created_at TIMESTAMPTZ DEFAULT NOW(),last_seen_at TIMESTAMPTZ DEFAULT NOW(),session_public_id TEXT UNIQUE DEFAULT gen_random_uuid()::text);`);
 const pool={query:(sql,params)=>sql.split(';').filter(x=>x.trim()).length>1?db.exec(sql):db.query(sql,params)};
 await initializeSingleLogin(pool);
 const routes=new Map(),app={post:(url,fn)=>routes.set(url,fn),options(){}};
 const identity=installPulseApplicationIdentity(app,{pool,sessionStore:createSessionStore(pool)});await identity.initialize();
 const sent=[];let next=0;const codes=['123456','654321','111111','222222','333333','444444','555555'];
 const telegram={
  findUser:async username=>{const {rows}=await db.query("SELECT id,record_data FROM master_records WHERE master_name='Users & employees'");const m=loginRecordCandidates(rows,username);return m.length===1?m[0]:null;},
  linkedChat:async login=>chats[String(login).toLowerCase()]||'',
  send:async(chatId,message)=>{if(sendFails)throw Error('Telegram down');sent.push({chatId,message});},
  newCode:()=>codes[next++%codes.length],hashCode:code=>hashPassword(code),checkCode:(code,hash)=>verifyPassword(code,hash),
 };
 const handoff=installMisLoginHandoff(app,{pool,identity,telegram});await handoff.initialize();
 for(const login of ['owner','nochat'])await db.query("INSERT INTO master_records(master_name,record_data) VALUES('Users & employees',$1)",[JSON.stringify({login,employee:login,userType:'Mobile User',passwordHash:hashPassword('pulse-test-password'),misAccess:true,misDesktopAccess:['Dashboard']})]);
 const call=async(path,body,ip='10.0.0.1')=>{let value;const res={statusCode:200,set(){return this},status(code){this.statusCode=code;return this},json(data){value=data;return this}};await routes.get(path)({body,headers:{},ip},res,e=>{throw e});return {status:res.statusCode,value}};
 const attempt=()=>{const verifier=randomBytes(32).toString('base64url'),state=randomBytes(32).toString('base64url');return {verifier,handoff:{state,challenge:createHash('sha256').update(verifier).digest('base64url')}};};
 return {db,call,sent,attempt};
}

test('a Telegram code signs in to MIS once, only for the sign-in that asked for it, and honours Remember me',async()=>{
 const {db,call,sent,attempt}=await harness();try{
 const {verifier,handoff}=attempt();
 const asked=await call('/api/mis-login/telegram-code',{username:'owner',...handoff});
 assert.equal(asked.status,202);assert.equal(sent.length,1);assert.equal(sent[0].chatId,'111');assert.match(sent[0].message,/123456/);
 const {requestToken}=asked.value;
 const other=attempt();
 assert.equal((await call('/api/mis-login/telegram-verify',{requestToken,code:'123456',...other.handoff})).status,401,'a code is bound to its own sign-in attempt');
 assert.equal((await call('/api/mis-login/telegram-verify',{requestToken,code:'000000',...handoff})).status,401);
 const ok=await call('/api/mis-login/telegram-verify',{requestToken,code:'123456',remember:true,...handoff});
 assert.equal(ok.status,200);const target=new URL(ok.value.redirectUrl);assert.equal(target.origin+target.pathname,'https://pulse-ll.cmll.in/api/mis-credentials/callback');
 assert.equal((await call('/api/mis-login/telegram-verify',{requestToken,code:'123456',...handoff})).status,401,'used once only');
 const exchanged=await call('/api/integrations/mis/exchange',{code:target.searchParams.get('code'),state:handoff.state,verifier});
 assert.equal(exchanged.status,200);assert.equal(exchanged.value.profile.login,'owner');assert.equal(exchanged.value.remember,true);
 const {rows}=await db.query('SELECT ROUND(EXTRACT(EPOCH FROM expires_at-NOW())/86400) AS days FROM application_identity_grants');assert.equal(Number(rows[0].days),30);
 }finally{await db.close()}
});

test('unknown users and users without Telegram get the same answer and no message',async()=>{
 const {db,call,sent,attempt}=await harness();try{
 for(const username of ['nobody','nochat']){
  const asked=await call('/api/mis-login/telegram-code',{username,...attempt().handoff});
  assert.equal(asked.status,202);assert.match(asked.value.requestToken,/^[A-Za-z0-9_-]{43}$/);
 }
 assert.equal(sent.length,0);
 }finally{await db.close()}
});

test('wrong codes, code requests and failed delivery are limited',async()=>{
 const {db,call,attempt}=await harness();try{
 const {handoff}=attempt();
 const {requestToken}=(await call('/api/mis-login/telegram-code',{username:'owner',...handoff})).value;
 for(let i=0;i<MIS_TELEGRAM_CODE_ATTEMPTS;i++)assert.equal((await call('/api/mis-login/telegram-verify',{requestToken,code:'000000',...handoff})).status,401);
 assert.equal((await call('/api/mis-login/telegram-verify',{requestToken,code:'123456',...handoff})).status,429,'even the right code is refused after five wrong ones');
 for(let i=1;i<MIS_TELEGRAM_CODES_PER_HOUR;i++)assert.equal((await call('/api/mis-login/telegram-code',{username:'owner',...attempt().handoff})).status,202);
 assert.equal((await call('/api/mis-login/telegram-code',{username:'owner',...attempt().handoff})).status,429);
 }finally{await db.close()}
 const failing=await harness({sendFails:true});try{
  const {handoff}=failing.attempt();
  const asked=await failing.call('/api/mis-login/telegram-code',{username:'owner',...handoff});
  assert.equal(asked.status,502);
  const {rows}=await failing.db.query('SELECT used_at FROM mis_telegram_signin_codes');assert.ok(rows[0].used_at,'an unsent code can never be used');
 }finally{await failing.db.close()}
});

test('a new code replaces the earlier one',async()=>{
 const {db,call,attempt}=await harness();try{
 const {handoff}=attempt();
 const first=(await call('/api/mis-login/telegram-code',{username:'owner',...handoff})).value.requestToken;
 const second=(await call('/api/mis-login/telegram-code',{username:'owner',...handoff})).value.requestToken;
 assert.equal((await call('/api/mis-login/telegram-verify',{requestToken:first,code:'123456',...handoff})).status,401);
 assert.equal((await call('/api/mis-login/telegram-verify',{requestToken:second,code:'654321',...handoff})).status,200);
 }finally{await db.close()}
});
