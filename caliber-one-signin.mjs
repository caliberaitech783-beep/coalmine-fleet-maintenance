import {createHash,randomBytes} from 'node:crypto';
import {pulseApplicationProfile} from './pulse-application-identity.mjs';

// Caliber One, one sign-in (owner, 28 Nov 2026): a person signed in to Pulse opens Pulse-II MIS and
// HR Pulse without typing the password again, as Diesel already does. Each application keeps its own
// access rule (MIS needs MIS access, HR needs HR access) and its own grant, issued by the same
// issueGrant as a password sign-in. The browser never receives a grant in a link: MIS gets a
// one-time code its server exchanges (PKCE), HR Pulse a one-time code its page exchanges with the
// verifier only it holds. "Sign out all" ends the grants opened this way together with Pulse.
export const HR_ORIGIN='https://hrpulse.cmll.in';
export const MIS_CALLBACK='https://pulse-ll.cmll.in/api/mis-credentials/callback';
const digest=value=>createHash('sha256').update(String(value)).digest('hex');
const proof=value=>createHash('sha256').update(String(value)).digest('base64url');
const valid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
const bearer=req=>String(req.headers?.authorization||'').replace(/^Bearer\s+/i,'').trim();

export function installCaliberOneSignIn(app,{pool,requireSession,identity,misRedirectFor}){
 const safe=handler=>async(req,res,next)=>{
  res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  try{await handler(req,res);}catch(error){next(error);}
 };
 // The Pulse login in Users & employees, found as the HR leave workspace finds it.
 async function userRow(session){
  const login=String(session?.login||'').trim().toLowerCase(),name=String(session?.name||'').trim().toLowerCase();
  if(!login&&!name)return null;
  const {rows}=await pool.query(`SELECT id,record_data FROM master_records
   WHERE master_name='Users & employees' AND (
    ($1<>'' AND lower(trim(record_data->>'login'))=$1) OR
    ($2<>'' AND lower(trim(record_data->>'employee'))=$2)
   ) ORDER BY CASE WHEN lower(trim(record_data->>'login'))=$1 THEN 0 ELSE 1 END,created_at DESC LIMIT 1`,[login,name]);
  return rows[0]||null;
 }
 // Remembers which grants a Pulse session opened, so Sign out all can end them.
 async function remember(req,application,token){
  await pool.query("DELETE FROM caliber_one_signins WHERE created_at<NOW()-INTERVAL '41 days'");
  await pool.query('INSERT INTO caliber_one_signins(parent_hash,application,session_token) VALUES($1,$2,$3)',[digest(bearer(req)),application,token]);
 }
 const audit=(req,profile,application)=>({eventType:'Security',module:'Authentication',action:`${application} login (Pulse sign-in)`,actorLogin:profile.login,actorName:profile.name,actorRole:profile.assignedRole,targetType:'User account',targetReference:String(profile.userId||profile.login),changedFields:[]});

 app.post('/api/mis-login/continue',requireSession,safe(async(req,res)=>{
  const {state,challenge}=req.body||{};
  if(!valid(state)||!valid(challenge))return res.status(400).json({error:'Start MIS sign-in again from Pulse-II.'});
  const row=await userRow(req.session),profile=row&&identity.profile(row);
  if(!profile)return res.status(403).json({error:'Your Pulse account is not enabled for MIS. Contact your administrator.'});
  const rememberDevice=req.body?.remember===true;
  const {grant,token}=await identity.issueGrant(row,'MIS',profile,{remember:rememberDevice});
  await remember(req,'MIS',token);
  req.audit=audit(req,profile,'MIS');req.auditSessionToken=token;
  res.json({redirectUrl:await misRedirectFor({state,challenge,grant,remember:rememberDevice})});
 }));

 app.post('/api/hr-login/continue',requireSession,safe(async(req,res)=>{
  const {state,challenge}=req.body||{};
  if(!valid(state)||!valid(challenge))return res.status(400).json({error:'Start HR sign-in again from HR Pulse.'});
  const row=await userRow(req.session),profile=row&&pulseApplicationProfile(row,'HR');
  if(!profile)return res.status(403).json({error:'HR access is not assigned to your Pulse account. Contact your administrator.'});
  const {grant,token}=await identity.issueGrant(row,'HR',profile);
  await remember(req,'HR',token);
  const code=randomBytes(32).toString('base64url');
  await pool.query('DELETE FROM caliber_one_codes WHERE expires_at<=NOW()');
  await pool.query("INSERT INTO caliber_one_codes(code_hash,application,challenge,state,grant_token,expires_at) VALUES($1,'HR',$2,$3,$4,NOW()+INTERVAL '60 seconds')",[digest(code),challenge,state,grant]);
  req.audit=audit(req,profile,'HR');req.auditSessionToken=token;
  const target=new URL('/',HR_ORIGIN);target.searchParams.set('hrCode',code);target.searchParams.set('hrState',state);
  res.json({redirectUrl:target.toString()});
 }));

 // HR Pulse's page swaps its one-time code for the grant, proving it started the sign-in.
 const hrCors=(req,res)=>{
  const origin=req.headers?.origin;
  if(origin&&origin!==HR_ORIGIN){res.status(403).json({error:'Origin is not allowed.'});return false;}
  if(origin)res.set({'Access-Control-Allow-Origin':HR_ORIGIN,'Vary':'Origin','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'});
  return true;
 };
 app.options('/api/integrations/hr/exchange',(req,res)=>{if(hrCors(req,res))res.status(204).end();});
 app.post('/api/integrations/hr/exchange',safe(async(req,res)=>{
  req.audit=false;
  if(!hrCors(req,res))return;
  const {code,state,verifier}=req.body||{};
  if(!valid(code)||!valid(state)||!valid(verifier))return res.status(400).json({error:'Invalid HR sign-in.'});
  const {rows}=await pool.query("DELETE FROM caliber_one_codes WHERE code_hash=$1 AND application='HR' AND challenge=$2 AND state=$3 AND expires_at>NOW() RETURNING grant_token",[digest(code),proof(verifier),state]);
  if(!rows[0])return res.status(401).json({error:'HR sign-in expired. Open HR Pulse again.'});
  let body,status=200;
  const proxy={set:()=>proxy,status(value){status=value;return proxy;},json(value){body=value;return proxy;}};
  await identity.handlers['/api/integrations/hr/validate'](Object.assign(Object.create(req),{headers:{},body:{grant:rows[0].grant_token}}),proxy,error=>{throw error;});
  if(status>=400||!body?.profile)return res.status(401).json({error:'HR sign-in expired. Open HR Pulse again.'});
  res.json({grant:rows[0].grant_token,profile:body.profile});
 }));

 // Ends the MIS and HR grants this Pulse session opened. The browser then signs out of Pulse
 // itself (/api/logout), which also ends Diesel, whose grant follows the Pulse session.
 app.post('/api/caliber-one/sign-out-all',requireSession,safe(async(req,res)=>{
  const {rows}=await pool.query('DELETE FROM caliber_one_signins WHERE parent_hash=$1 RETURNING application,session_token',[digest(bearer(req))]);
  for(const {application,session_token:token} of rows){
   await pool.query('DELETE FROM application_identity_grants WHERE session_token=$1 AND application=$2',[token,application]);
   await pool.query("DELETE FROM auth_sessions WHERE token=$1 AND permissions->>'application'=$2",[token,application]);
  }
  req.audit={eventType:'Security',module:'Authentication',action:'Sign out all (Caliber One)',targetType:'User account',targetReference:req.session.login||req.session.name,changedFields:[]};
  res.json({ok:true,signedOut:rows.length});
 }));

 return {initialize:async()=>{
  await pool.query('CREATE TABLE IF NOT EXISTS caliber_one_codes(code_hash TEXT PRIMARY KEY,application TEXT NOT NULL,challenge TEXT NOT NULL,state TEXT NOT NULL,grant_token TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL)');
  await pool.query('CREATE TABLE IF NOT EXISTS caliber_one_signins(parent_hash TEXT NOT NULL,application TEXT NOT NULL,session_token UUID NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  await pool.query('CREATE INDEX IF NOT EXISTS caliber_one_signins_parent ON caliber_one_signins(parent_hash)');
 }};
}
