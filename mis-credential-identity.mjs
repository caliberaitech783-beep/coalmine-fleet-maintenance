import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {verifyPassword} from './password-auth.mjs';
import {misAccessEnabled,misProfilePermissions} from './mis-permissions.mjs';
const digest=v=>createHash('sha256').update(String(v)).digest('hex');
const version=u=>digest(`${u.misPasswordHash}:${u.misLogin}`);
export function misCredentialProfile(row){
 const u=row?.record_data||{};
 if(!row||!misAccessEnabled(u)||!u.misPasswordHash||u.active===false||['false','inactive','disabled','terminated'].includes(String(u.status||u.active||'').toLowerCase()))return null;
 return {role:'super',userType:'MIS Application User',assignedRole:'MIS Application User',login:String(u.login||u.misLogin),name:u.employee||u.name||u.login,permissions:misProfilePermissions(u)};
}
export function installMisCredentialIdentity(app,{pool,sessionStore}){
 const safe=fn=>async(req,res,next)=>{res.set('Cache-Control','no-store');req.audit=false;try{await fn(req,res);}catch(error){next(error)}};
 app.post('/api/integrations/mis/authenticate',safe(async(req,res)=>{
  const username=String(req.body?.username||'').trim().toLowerCase(),password=req.body?.password;
  if(!username||username.length>120||typeof password!=='string'||password.length>256)return res.status(401).json({error:'MIS username or password is incorrect.'});
  const bucket=Math.floor(Date.now()/600000),key=digest(`${req.ip}:${username}:${bucket}`);
  const {rows:rate}=await pool.query(`INSERT INTO mis_credential_attempts(key,attempts,created_at) VALUES($1,1,NOW()) ON CONFLICT(key) DO UPDATE SET attempts=mis_credential_attempts.attempts+1 RETURNING attempts`,[key]);
  if(Number(rate[0].attempts)>10)return res.status(429).json({error:'Too many MIS sign-in attempts. Try again in ten minutes.'});
  await pool.query("DELETE FROM mis_credential_attempts WHERE created_at<NOW()-INTERVAL '20 minutes'");
  const {rows}=await pool.query("SELECT id,record_data FROM master_records WHERE master_name='Users & employees' AND lower(trim(record_data->>'misLogin'))=$1",[username]);
  const row=rows.length===1?rows[0]:null,profile=misCredentialProfile(row);
  if(!profile||!verifyPassword(password,row.record_data.misPasswordHash))return res.status(401).json({error:'MIS username or password is incorrect.'});
  const token=randomUUID(),grant=randomBytes(32).toString('base64url');
  await sessionStore.create({token,...profile});
  await pool.query("INSERT INTO mis_credential_grants(grant_hash,user_id,credential_version,session_token,expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '7 days')",[digest(grant),row.id,version(row.record_data),token]);
  await pool.query("DELETE FROM mis_credential_grants WHERE expires_at<=NOW()");
  req.audit={eventType:'Security',module:'Authentication',action:'MIS login',actorLogin:profile.login,actorName:profile.name,actorRole:profile.assignedRole,targetType:'User account',targetReference:String(row.id),changedFields:[]};
  req.auditSessionToken=token;
  res.json({grant,profile});
 }));
 app.post('/api/integrations/mis/validate',safe(async(req,res)=>{
  if(!/^[A-Za-z0-9_-]{43}$/.test(String(req.body?.grant||'')))return res.status(401).json({error:'MIS session expired.'});
  const {rows}=await pool.query(`SELECT u.id,u.record_data,g.credential_version FROM mis_credential_grants g JOIN master_records u ON u.id=g.user_id AND u.master_name='Users & employees' JOIN auth_sessions s ON s.token=g.session_token WHERE g.grant_hash=$1 AND g.expires_at>NOW() AND s.created_at>NOW()-INTERVAL '7 days'`,[digest(req.body.grant)]);
  const row=rows[0],profile=misCredentialProfile(row);
  if(!profile||row.credential_version!==version(row.record_data))return res.status(401).json({error:'MIS session expired or access changed. Sign in again.'});
  res.json({profile});
 }));
 app.post('/api/integrations/mis/logout',safe(async(req,res)=>{
  if(/^[A-Za-z0-9_-]{43}$/.test(String(req.body?.grant||'')))await pool.query('WITH revoked AS (DELETE FROM mis_credential_grants WHERE grant_hash=$1 RETURNING session_token) DELETE FROM auth_sessions WHERE token IN (SELECT session_token FROM revoked)',[digest(req.body.grant)]);
  res.json({ok:true});
 }));
 return {async initialize(){await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_mis_login_unique ON master_records(lower(trim(record_data->>'misLogin'))) WHERE master_name='Users & employees' AND record_data->>'misAccess'='true' AND COALESCE(record_data->>'misLogin','')<>'';CREATE TABLE IF NOT EXISTS mis_credential_grants(grant_hash TEXT PRIMARY KEY,user_id BIGINT NOT NULL,credential_version TEXT NOT NULL,session_token UUID NOT NULL,expires_at TIMESTAMPTZ NOT NULL);CREATE INDEX IF NOT EXISTS mis_credential_grants_expiry ON mis_credential_grants(expires_at);CREATE TABLE IF NOT EXISTS mis_credential_attempts(key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,created_at TIMESTAMPTZ NOT NULL);`);}};
}
