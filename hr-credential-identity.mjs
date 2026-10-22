import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {verifyPassword} from './password-auth.mjs';
import {HR_APPLICATION_URL,hrAccessEnabled,hrProfilePermissions} from './hr-permissions.mjs';
const digest=value=>createHash('sha256').update(String(value)).digest('hex');
const version=user=>digest(`${user.hrPasswordHash}:${user.hrLogin}`);
export function hrCredentialProfile(row){
 const user=row?.record_data||{},permissions=hrProfilePermissions(user);
 if(!row||!hrAccessEnabled(user)||!user.hrPasswordHash||!user.hrLogin||user.active===false||['false','inactive','disabled','terminated'].includes(String(user.status||user.active||'').toLowerCase())||!permissions.hrDesktopAccess.length&&!permissions.hrMobileAccess.length)return null;
 return {role:'normal',userType:'HR Application User',assignedRole:'HR Application User',login:String(user.login||user.hrLogin),name:user.employee||user.name||user.login,permissions};
}
export function installHrCredentialIdentity(app,{pool,sessionStore,allowedOrigins=[new URL(HR_APPLICATION_URL).origin]}){
 const safe=handler=>async(req,res,next)=>{
  res.set('Cache-Control','no-store');req.audit=false;
  const origin=req.headers?.origin;
  if(origin){
   res.vary('Origin');
   if(!allowedOrigins.includes(origin))return res.status(403).json({error:'This origin is not allowed to use HR authentication.'});
   res.set('Access-Control-Allow-Origin',origin);
   res.set('Access-Control-Allow-Methods','POST, OPTIONS');res.set('Access-Control-Allow-Headers','Content-Type');
  }
  if(req.method==='OPTIONS')return res.status(204).end();
  try{await handler(req,res);}catch(error){next(error);}
 };
 for(const action of ['authenticate','validate','logout'])app.options('/api/integrations/hr/'+action,safe(async()=>{}));
 app.post('/api/integrations/hr/authenticate',safe(async(req,res)=>{
  const username=String(req.body?.username||'').trim().toLowerCase(),password=req.body?.password;
  if(!username||username.length>120||typeof password!=='string'||!password||password.length>256)return res.status(401).json({error:'HR username or password is incorrect.'});
  const key=digest(`${req.ip}:${username}:${Math.floor(Date.now()/600000)}`);
  const {rows:rate}=await pool.query(`INSERT INTO hr_credential_attempts(key,attempts,created_at) VALUES($1,1,NOW()) ON CONFLICT(key) DO UPDATE SET attempts=hr_credential_attempts.attempts+1 RETURNING attempts`,[key]);
  if(Number(rate[0].attempts)>10)return res.status(429).json({error:'Too many HR sign-in attempts. Try again in ten minutes.'});
  await pool.query("DELETE FROM hr_credential_attempts WHERE created_at<NOW()-INTERVAL '20 minutes'");
  const {rows}=await pool.query("SELECT id,record_data FROM master_records WHERE master_name='Users & employees' AND lower(trim(record_data->>'hrLogin'))=$1",[username]);
  const row=rows.length===1?rows[0]:null,profile=hrCredentialProfile(row);
  if(!profile||!verifyPassword(password,row.record_data.hrPasswordHash))return res.status(401).json({error:'HR username or password is incorrect.'});
  const token=randomUUID(),grant=randomBytes(32).toString('base64url');
  await sessionStore.create({token,...profile});
  await pool.query("INSERT INTO hr_credential_grants(grant_hash,user_id,credential_version,session_token,expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '7 days')",[digest(grant),row.id,version(row.record_data),token]);
  await pool.query('DELETE FROM hr_credential_grants WHERE expires_at<=NOW()');
  req.audit={eventType:'Security',module:'Authentication',action:'HR login',actorLogin:profile.login,actorName:profile.name,actorRole:profile.assignedRole,targetType:'User account',targetReference:String(row.id),changedFields:[]};req.auditSessionToken=token;
  res.json({grant,profile});
 }));
 app.post('/api/integrations/hr/validate',safe(async(req,res)=>{
  if(!/^[A-Za-z0-9_-]{43}$/.test(String(req.body?.grant||'')))return res.status(401).json({error:'HR session expired.'});
  const {rows}=await pool.query(`SELECT u.id,u.record_data,g.credential_version FROM hr_credential_grants g JOIN master_records u ON u.id=g.user_id AND u.master_name='Users & employees' JOIN auth_sessions s ON s.token=g.session_token WHERE g.grant_hash=$1 AND g.expires_at>NOW() AND s.created_at>NOW()-INTERVAL '7 days'`,[digest(req.body.grant)]);
  const row=rows[0],profile=hrCredentialProfile(row);
  if(!profile||row.credential_version!==version(row.record_data))return res.status(401).json({error:'HR session expired or access changed. Sign in again.'});
  res.json({profile});
 }));
 app.post('/api/integrations/hr/logout',safe(async(req,res)=>{
  if(/^[A-Za-z0-9_-]{43}$/.test(String(req.body?.grant||'')))await pool.query('WITH revoked AS (DELETE FROM hr_credential_grants WHERE grant_hash=$1 RETURNING session_token) DELETE FROM auth_sessions WHERE token IN (SELECT session_token FROM revoked)',[digest(req.body.grant)]);
  res.json({ok:true});
 }));
 return {async initialize(){await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_hr_login_unique ON master_records(lower(trim(record_data->>'hrLogin'))) WHERE master_name='Users & employees' AND record_data->>'hrAccess'='true' AND COALESCE(record_data->>'hrLogin','')<>'';CREATE TABLE IF NOT EXISTS hr_credential_grants(grant_hash TEXT PRIMARY KEY,user_id BIGINT NOT NULL,credential_version TEXT NOT NULL,session_token UUID NOT NULL,expires_at TIMESTAMPTZ NOT NULL);CREATE INDEX IF NOT EXISTS hr_credential_grants_expiry ON hr_credential_grants(expires_at);CREATE TABLE IF NOT EXISTS hr_credential_attempts(key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,created_at TIMESTAMPTZ NOT NULL);`);}};
}
