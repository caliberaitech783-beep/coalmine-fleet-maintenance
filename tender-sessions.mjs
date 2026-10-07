import {randomUUID} from 'node:crypto';
const clean=(value,max)=>String(value||'').slice(0,max);
export async function createTenderSession(pool,profile,details={}){
 const id=randomUUID();
 await pool.query(`INSERT INTO auth_sessions(token,role,employee_name,login_name,user_type,assigned_role,permissions,session_public_id,ip_address,device_id,user_agent)
 VALUES($1,'normal',$2,$3,'Tender User','Tender User',$4::jsonb,$5,$6,$7,$8)`,[randomUUID(),profile.name,profile.login,JSON.stringify({application:'Tender',bdmsId:profile.id,credentialVersion:profile.credentialVersion}),id,clean(details.ipAddress,100),clean(details.deviceId,80),clean(details.userAgent,500)]);
 return id;
}
export async function currentTenderSession(pool,profile,id){
 if(!/^[0-9a-f-]{36}$/i.test(String(id||'')))return false;
 const {rows}=await pool.query(`SELECT session_public_id FROM auth_sessions WHERE session_public_id=$1 AND permissions->>'application'='Tender' AND permissions->>'bdmsId'=$2 AND permissions->>'credentialVersion'=$3 AND created_at>NOW()-INTERVAL '30 days'`,[id,profile.id,profile.credentialVersion]);
 return rows.length>0;
}
export async function touchTenderSession(pool,profile,id,details={}){
 const values=[id,clean(details.ipAddress,100),clean(details.deviceId,80),clean(details.userAgent,500)];
 await pool.query(`UPDATE auth_sessions SET last_seen_at=NOW(),ip_address=$2,device_id=$3,user_agent=$4 WHERE session_public_id=$1 AND (last_seen_at<=NOW()-INTERVAL '30 seconds' OR ip_address IS DISTINCT FROM $2 OR device_id IS DISTINCT FROM $3 OR user_agent IS DISTINCT FROM $4)`,values);
 await pool.query(`INSERT INTO user_session_activity(session_id,actor_login,actor_name,actor_role,started_at,last_seen_at,active_seconds,ip_address,device_id,user_agent)
 SELECT session_public_id,login_name,employee_name,'Tender User',created_at,NOW(),0,ip_address,device_id,user_agent FROM auth_sessions WHERE session_public_id=$1
 ON CONFLICT(session_id) DO UPDATE SET active_seconds=user_session_activity.active_seconds+LEAST(1800,GREATEST(0,FLOOR(EXTRACT(EPOCH FROM(NOW()-user_session_activity.last_seen_at)))))::bigint,last_seen_at=NOW(),ip_address=EXCLUDED.ip_address,device_id=EXCLUDED.device_id,user_agent=EXCLUDED.user_agent WHERE user_session_activity.last_seen_at<=NOW()-INTERVAL '5 seconds'`,[id]);
}
export async function endTenderSession(pool,profile,id){
 await pool.query(`DELETE FROM auth_sessions WHERE session_public_id=$1 AND permissions->>'application'='Tender' AND permissions->>'bdmsId'=$2`,[id,profile.id]);
}
