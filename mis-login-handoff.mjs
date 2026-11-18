import {createHash,randomBytes} from 'node:crypto';
const digest=value=>createHash('sha256').update(String(value)).digest('hex');
const proof=value=>createHash('sha256').update(String(value)).digest('base64url');
const valid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
const callback='https://pulse-ll.cmll.in/api/mis-credentials/callback';

// Reuse the existing credential checks and retry policy. Never return the
// long-lived MIS grant to the browser or put a password/token in a URL.
export function installMisLoginHandoff(app,{pool,identity,telegram=null}){
 async function capture(handler,req,res){
  let body,error;
  const proxy={set:(...args)=>res.set(...args),status(code){res.status(code);return proxy;},json(value){body=value;}};
  await handler(req,proxy,value=>{error=value;});
  if(error)throw error;
  return body;
 }
 const safe=handler=>async(req,res,next)=>{
  res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});req.audit=false;
  try{await handler(req,res);}catch(error){next(error);}
 };
 app.post('/api/mis-login/authorize',safe(async(req,res)=>{
  const {state,challenge}=req.body||{};
  if(!valid(state)||!valid(challenge))return res.status(400).json({error:'Start MIS sign-in again using the MIS tab in Pulse.'});
  const result=await capture(identity.handlers['/api/integrations/mis/authenticate'],req,res);
  if(res.statusCode>=400||!result?.grant)return res.json(result);
  res.json({redirectUrl:await redirectFor({state,challenge,grant:result.grant,remember:req.body?.remember===true})});
 }));
 // The one-time return link to Pulse-II, whichever way the person signed in.
 async function redirectFor({state,challenge,grant,remember}){
  const code=randomBytes(32).toString('base64url');
  await pool.query('DELETE FROM mis_login_codes WHERE expires_at<=NOW()');
  await pool.query("INSERT INTO mis_login_codes(code_hash,challenge,state,grant_token,expires_at,remember) VALUES($1,$2,$3,$4,NOW()+INTERVAL '60 seconds',$5)",[digest(code),challenge,state,grant,remember===true]);
  const target=new URL(callback);target.searchParams.set('code',code);target.searchParams.set('state',state);
  return target.toString();
 }
 if(telegram)installTelegramCodeSignIn(app,{pool,identity,telegram,safe,valid,redirectFor});
 app.post('/api/integrations/mis/exchange',safe(async(req,res)=>{
  const {code,state,verifier}=req.body||{};
  if(!valid(code)||!valid(state)||!valid(verifier))return res.status(400).json({error:'Invalid MIS sign-in handoff.'});
  const {rows}=await pool.query('DELETE FROM mis_login_codes WHERE code_hash=$1 AND challenge=$2 AND state=$3 AND expires_at>NOW() RETURNING grant_token,remember',[digest(code),proof(verifier),state]);
  if(!rows[0])return res.status(401).json({error:'MIS sign-in expired. Start again from Pulse.'});
  const validationReq=Object.assign(Object.create(req),{body:{grant:rows[0].grant_token}});
  const result=await capture(identity.handlers['/api/integrations/mis/validate'],validationReq,res);
  if(res.statusCode>=400||!result?.profile)return res.json(result);
  res.json({grant:rows[0].grant_token,profile:result.profile,remember:rows[0].remember===true});
 }));
 return {initialize:async()=>{
  await pool.query('CREATE TABLE IF NOT EXISTS mis_login_codes(code_hash TEXT PRIMARY KEY,challenge TEXT NOT NULL,state TEXT NOT NULL,grant_token TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL)');
  await pool.query('ALTER TABLE mis_login_codes ADD COLUMN IF NOT EXISTS remember BOOLEAN NOT NULL DEFAULT false');
  await pool.query(`CREATE TABLE IF NOT EXISTS mis_telegram_signin_codes(request_hash TEXT PRIMARY KEY,user_id BIGINT NOT NULL,otp_hash TEXT NOT NULL,
   state TEXT NOT NULL,challenge TEXT NOT NULL,requested_ip TEXT NOT NULL DEFAULT '',attempts INTEGER NOT NULL DEFAULT 0,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),expires_at TIMESTAMPTZ NOT NULL,used_at TIMESTAMPTZ)`);
 }};
}

// Sign in to MIS with a 6-digit code sent to the person's own Telegram chat with the
// Pulse bot, instead of the password. Same rules as the Telegram password-reset code:
// private chat only, short expiry, few tries, few codes per hour. The code works only
// for the MIS sign-in attempt that asked for it (bound to its state and challenge).
export const MIS_TELEGRAM_CODE_MINUTES=5,MIS_TELEGRAM_CODE_ATTEMPTS=5,MIS_TELEGRAM_CODES_PER_HOUR=5;
const TELEGRAM_CODE_SENT='If this Pulse username has Telegram connected, a 6-digit code has been sent to your Telegram chat with the Pulse bot.';
function installTelegramCodeSignIn(app,{pool,identity,telegram,safe,valid,redirectFor}){
 const {findUser,linkedChat,send,hashCode,checkCode,newCode}=telegram;
 app.post('/api/mis-login/telegram-code',safe(async(req,res)=>{
  const {state,challenge}=req.body||{},username=String(req.body?.username||'').trim().toLowerCase();
  if(!valid(state)||!valid(challenge))return res.status(400).json({error:'Start MIS sign-in again using the MIS tab in Pulse.'});
  if(!username||username.length>200)return res.status(400).json({error:'Enter your Pulse username first.'});
  // Always answer the same way, so the page never reveals which usernames exist.
  const quiet=()=>res.status(202).json({message:TELEGRAM_CODE_SENT,requestToken:randomBytes(32).toString('base64url')});
  const row=await findUser(username);
  if(!row||!identity.profile(row))return quiet();
  const chat=await linkedChat(row.record_data.login);
  if(!chat)return quiet();
  const ip=String(req.ip||req.socket?.remoteAddress||'').slice(0,100);
  const {rows:limits}=await pool.query(`SELECT COUNT(*) FILTER (WHERE user_id=$1 AND created_at>NOW()-INTERVAL '1 hour')::int AS account,
   COUNT(*) FILTER (WHERE requested_ip=$2 AND requested_ip<>'' AND created_at>NOW()-INTERVAL '1 hour')::int AS ip FROM mis_telegram_signin_codes`,[row.id,ip]);
  if(Number(limits[0]?.account||0)>=MIS_TELEGRAM_CODES_PER_HOUR||Number(limits[0]?.ip||0)>=20)return res.status(429).json({error:'Too many codes were asked for. Wait an hour or sign in with your password.'});
  const requestToken=randomBytes(32).toString('base64url'),otp=newCode();
  await pool.query("DELETE FROM mis_telegram_signin_codes WHERE created_at<NOW()-INTERVAL '1 day'");
  await pool.query('UPDATE mis_telegram_signin_codes SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL',[row.id]);
  await pool.query(`INSERT INTO mis_telegram_signin_codes(request_hash,user_id,otp_hash,state,challenge,requested_ip,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,NOW()+make_interval(mins=>$7::int))`,[digest(requestToken),row.id,hashCode(otp),state,challenge,ip,MIS_TELEGRAM_CODE_MINUTES]);
  try{await send(chat,`Caliber MIS sign-in code: ${otp}\nValid for ${MIS_TELEGRAM_CODE_MINUTES} minutes. Do not share this code.\nIf you did not try to sign in to MIS just now, ignore this message.`);}
  catch(error){
   await pool.query('UPDATE mis_telegram_signin_codes SET used_at=NOW() WHERE request_hash=$1',[digest(requestToken)]);
   console.error('MIS Telegram sign-in code could not be sent:',error.message);
   return res.status(502).json({error:'The code could not be sent to Telegram. Sign in with your password, or ask an administrator to check Telegram.'});
  }
  req.audit={eventType:'Security',module:'Authentication',action:'Send MIS sign-in code by Telegram',actorLogin:String(row.record_data.login||username),targetType:'User account',targetReference:String(row.id),changedFields:[]};
  res.status(202).json({message:TELEGRAM_CODE_SENT,requestToken});
 }));
 app.post('/api/mis-login/telegram-verify',safe(async(req,res)=>{
  const {state,challenge,requestToken}=req.body||{},code=String(req.body?.code||'').trim();
  if(!valid(state)||!valid(challenge))return res.status(400).json({error:'Start MIS sign-in again using the MIS tab in Pulse.'});
  if(!valid(requestToken)||!/^\d{6}$/.test(code))return res.status(400).json({error:'Enter the 6-digit code from Telegram.'});
  // Count the try before checking it, so guesses sent together cannot pass the limit.
  const {rows}=await pool.query(`UPDATE mis_telegram_signin_codes SET attempts=attempts+1 WHERE request_hash=$1 AND state=$2 AND challenge=$3
   AND used_at IS NULL AND expires_at>NOW() AND attempts<$4 RETURNING user_id,otp_hash`,[digest(requestToken),state,challenge,MIS_TELEGRAM_CODE_ATTEMPTS]);
  const pending=rows[0];
  if(!pending){
   const {rows:spent}=await pool.query('SELECT 1 FROM mis_telegram_signin_codes WHERE request_hash=$1 AND state=$2 AND challenge=$3 AND used_at IS NULL AND expires_at>NOW() AND attempts>=$4',[digest(requestToken),state,challenge,MIS_TELEGRAM_CODE_ATTEMPTS]);
   return spent.length?res.status(429).json({error:'Too many wrong codes. Ask for a new code.'}):res.status(401).json({error:'This code has expired. Ask for a new code.'});
  }
  if(!checkCode(code,pending.otp_hash))return res.status(401).json({error:'The code is not correct. Check Telegram and try again.'});
  // Used once only: the update succeeds for exactly one request even if two arrive together.
  const {rows:claimed}=await pool.query('UPDATE mis_telegram_signin_codes SET used_at=NOW() WHERE request_hash=$1 AND used_at IS NULL RETURNING user_id',[digest(requestToken)]);
  if(!claimed[0])return res.status(401).json({error:'This code has already been used. Ask for a new code.'});
  const {rows:users}=await pool.query("SELECT id,record_data FROM master_records WHERE id=$1 AND master_name='Users & employees'",[pending.user_id]);
  const row=users[0],profile=row&&identity.profile(row);
  if(!profile)return res.status(403).json({error:'Your Pulse account is not enabled for MIS, is inactive, or requires its first password change. Contact your administrator.'});
  const {grant,token}=await identity.issueGrant(row,'MIS',profile,{remember:req.body?.remember===true});
  req.audit={eventType:'Security',module:'Authentication',action:'MIS login (Telegram code)',actorLogin:profile.login,actorName:profile.name,actorRole:profile.assignedRole,targetType:'User account',targetReference:String(row.id),changedFields:[]};req.auditSessionToken=token;
  res.json({redirectUrl:await redirectFor({state,challenge,grant,remember:req.body?.remember===true})});
 }));
}
