import {hrAccessEnabled,hrProfilePermissions,HR_ALL_PERMISSIONS} from './hr-permissions.mjs';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {verifyPassword} from './password-auth.mjs';
import {assignedUserRoles} from './account-role-access.mjs';
import {loginRecordCandidates} from './mobile-access.mjs';
import {misAccessEnabled,misProfilePermissions,MIS_ALL_PERMISSIONS} from './mis-permissions.mjs';
const digest=value=>createHash('sha256').update(String(value)).digest('hex');
const valid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
const hrOrigin='https://hrpulse.cmll.in';
const version=user=>digest(`${user.login}:${user.passwordHash}`);
export function pulseApplicationProfile(row,application){
 const user=row?.record_data||{};
 if(!row||!user.passwordHash||user.mustChangePassword===true||user.active===false||['false','inactive','disabled','terminated'].includes(String(user.status||user.active||'').toLowerCase()))return null;
 const admin=/super/i.test(user.userType||'')&&['admin','super admin'].includes(String(user.adminLevel||'Admin').toLowerCase());
 const roles=assignedUserRoles(user);
 if(application==='MIS'){
  if(!admin&&!misAccessEnabled(user))return null;
  const access=admin&&!misAccessEnabled(user)?{...user,misDesktopAccess:MIS_ALL_PERMISSIONS,misMobileAccess:MIS_ALL_PERMISSIONS}:user;
  return {role:'super',userType:'MIS Application User',assignedRole:'MIS Application User',login:String(user.login),name:user.employee||user.name||user.login,permissions:{...misProfilePermissions(access),sharedPulseCredentials:true}};
 }
 const hrRole=roles.includes('HR Manager')?'HR Manager':roles.includes('HR User')?'HR User':null;
 if(application!=='HR'||!admin&&!hrRole&&!hrAccessEnabled(user))return null;
 const hrPermissions=hrProfilePermissions(hrAccessEnabled(user)?user:{hrDesktopAccess:HR_ALL_PERMISSIONS,hrMobileAccess:HR_ALL_PERMISSIONS});
 return {role:admin?'super':'normal',userType:admin?'Super Admin':'Mobile User',assignedRole:hrRole||'Admin',login:String(user.login),name:user.employee||user.name||user.login,permissions:{...hrPermissions,sharedPulseCredentials:true,adminLevel:admin?user.adminLevel||'Admin':null,site:user.site||user.location||''}};
}
export function installPulseApplicationIdentity(app,{pool,sessionStore}){
 const handlers={};
 const cors=(req,res)=>{
  const origin=req.headers?.origin;
  if(origin&&origin!==hrOrigin){res.status(403).json({error:'Origin is not allowed.'});return false;}
  if(origin)res.set({'Access-Control-Allow-Origin':hrOrigin,'Vary':'Origin','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'});
  return true;
 };
 app.options('/api/integrations/hr/:action',(req,res)=>{if(cors(req,res))res.status(204).end();});
 for(const application of ['MIS','HR']){
  const prefix=`/api/integrations/${application.toLowerCase()}`;
  const route=(action,handler)=>{
   const wrapped=async(req,res,next)=>{res.set('Cache-Control','no-store');req.audit=false;if(application==='HR'&&!cors(req,res))return;try{await handler(req,res);}catch(error){next(error);}};
   handlers[`${prefix}/${action}`]=wrapped;app.post(`${prefix}/${action}`,wrapped);
  };
  route('authenticate',async(req,res)=>{
   const username=String(req.body?.username||'').trim().toLowerCase(),password=req.body?.password;
   if(!username||username.length>200||typeof password!=='string'||!password||password.length>1024)return res.status(401).json({error:'Enter your Pulse username and password.'});
   const bucket=Math.floor(Date.now()/600000),key=digest(`pulse-app:${application}:${req.ip}:${username}:${bucket}`);
   const {rows:attempts}=await pool.query('SELECT attempts FROM application_login_attempts WHERE key=$1',[key]);
   if(Number(attempts[0]?.attempts||0)>=10)return res.status(429).json({error:'Too many unsuccessful attempts. Try again in ten minutes.'});
   const {rows}=await pool.query("SELECT id,record_data FROM master_records WHERE master_name='Users & employees'");
   let matches=loginRecordCandidates(rows,username);
   const exact=matches.filter(row=>String(row.record_data.login||'').trim().toLowerCase()===username);if(exact.length)matches=exact;
   const row=matches.length===1?matches[0]:null;
   if(!row||!verifyPassword(password,row.record_data.passwordHash)){
    await pool.query(`INSERT INTO application_login_attempts(key,attempts,created_at) VALUES($1,1,NOW()) ON CONFLICT(key) DO UPDATE SET attempts=application_login_attempts.attempts+1`,[key]);
    return res.status(401).json({error:'Pulse username or password is incorrect.'});
   }
   const profile=pulseApplicationProfile(row,application);
   if(!profile)return res.status(403).json({error:`Your Pulse account is not enabled for ${application}, is inactive, or requires its first password change. Contact your administrator.`});
   await pool.query('DELETE FROM application_login_attempts WHERE key=$1',[key]);
   await pool.query("DELETE FROM application_login_attempts WHERE created_at<NOW()-INTERVAL '20 minutes'");
   const token=randomUUID(),grant=randomBytes(32).toString('base64url');
   await sessionStore.create({token,...profile});
   await pool.query("INSERT INTO application_identity_grants(grant_hash,application,user_id,credential_version,session_token,expires_at) VALUES($1,$2,$3,$4,$5,NOW()+INTERVAL '7 days')",[digest(grant),application,row.id,version(row.record_data),token]);
   await pool.query('DELETE FROM application_identity_grants WHERE expires_at<=NOW()');
   req.audit={eventType:'Security',module:'Authentication',action:`${application} login`,actorLogin:profile.login,actorName:profile.name,actorRole:profile.assignedRole,targetType:'User account',targetReference:String(row.id),changedFields:[]};req.auditSessionToken=token;
   res.json({grant,profile});
  });
  route('validate',async(req,res)=>{
   const grant=req.body?.grant;if(!valid(grant))return res.status(401).json({error:'Sign-in expired.'});
   const {rows}=await pool.query(`SELECT u.id,u.record_data,g.credential_version FROM application_identity_grants g JOIN master_records u ON u.id=g.user_id AND u.master_name='Users & employees' JOIN auth_sessions s ON s.token=g.session_token WHERE g.grant_hash=$1 AND g.application=$2 AND g.expires_at>NOW() AND s.created_at>NOW()-INTERVAL '7 days' AND s.permissions->>'application'=$2`,[digest(grant),application]);
   const row=rows[0],profile=pulseApplicationProfile(row,application);
   if(!profile||row.credential_version!==version(row.record_data))return res.status(401).json({error:'Pulse sign-in expired or account access changed. Sign in again.'});
   res.json({profile});
  });
  route('logout',async(req,res)=>{
   if(valid(req.body?.grant))await pool.query('WITH revoked AS (DELETE FROM application_identity_grants WHERE grant_hash=$1 AND application=$2 RETURNING session_token) DELETE FROM auth_sessions WHERE token IN (SELECT session_token FROM revoked)',[digest(req.body.grant),application]);
   res.json({ok:true});
  });
 }
 return {handlers,initialize:()=>pool.query(`CREATE TABLE IF NOT EXISTS application_identity_grants(grant_hash TEXT PRIMARY KEY,application TEXT NOT NULL,user_id BIGINT NOT NULL,credential_version TEXT NOT NULL,session_token UUID NOT NULL,expires_at TIMESTAMPTZ NOT NULL);CREATE INDEX IF NOT EXISTS application_identity_grants_expiry ON application_identity_grants(expires_at);CREATE TABLE IF NOT EXISTS application_login_attempts(key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,created_at TIMESTAMPTZ NOT NULL);`)};
}
