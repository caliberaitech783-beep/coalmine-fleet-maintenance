import {userMasterRole} from './src/user-master-role.mjs';
import {loginHistoryRange} from './user-login-history.mjs';
export async function initializeLoginDays(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS user_login_days(login TEXT NOT NULL,day DATE NOT NULL,PRIMARY KEY(login,day));
 CREATE OR REPLACE FUNCTION preserve_user_login_day() RETURNS trigger LANGUAGE plpgsql AS $day$
 BEGIN
  IF COALESCE(trim(NEW.login_name),'')<>'' THEN
   INSERT INTO user_login_days(login,day) VALUES(lower(trim(NEW.login_name)),(NEW.created_at AT TIME ZONE 'Asia/Kolkata')::date) ON CONFLICT DO NOTHING;
  END IF; RETURN NEW;
 END $day$;
 CREATE OR REPLACE TRIGGER auth_session_login_day AFTER INSERT ON auth_sessions FOR EACH ROW EXECUTE FUNCTION preserve_user_login_day();
 INSERT INTO user_login_days(login,day) SELECT lower(trim(login)),(started_at AT TIME ZONE 'Asia/Kolkata')::date FROM user_login_history WHERE trim(login)<>'' ON CONFLICT DO NOTHING;
 INSERT INTO user_login_days(login,day) SELECT login,(last_login_at AT TIME ZONE 'Asia/Kolkata')::date FROM user_login_summary WHERE last_login_at IS NOT NULL ON CONFLICT DO NOTHING;
 INSERT INTO app_metadata(key,value) VALUES('login_days_complete_from',((NOW() AT TIME ZONE 'Asia/Kolkata')::date)::text) ON CONFLICT(key) DO NOTHING;`);
}
export function registerInactiveUsers(app,{pool,requireSession,requireView,locationName}){
 app.get('/api/inactive-users',requireSession,requireView,async(req,res,next)=>{
  let range;try{range=loginHistoryRange({...req.query,period:'custom'});}catch(error){return res.status(400).json({error:error.message})}
  try{
   res.set('Cache-Control','no-store');
   const {rows:coverage}=await pool.query("SELECT value FROM app_metadata WHERE key='login_days_complete_from'");
   const completeFrom=coverage[0]?.value;
   if(!completeFrom||req.query.from<completeFrom)return res.status(400).json({error:`Complete date-range tracking is available from ${completeFrom||'today'}. Older detailed history may have been deleted.`,completeFrom});
   const {rows}=await pool.query(`WITH accounts AS (
    SELECT DISTINCT ON(lower(trim(record_data->>'login'))) id,record_data FROM master_records
    WHERE master_name='Users & employees' AND COALESCE(trim(record_data->>'login'),'')<>''
      AND COALESCE(record_data->>'passwordHash','')<>''
    ORDER BY lower(trim(record_data->>'login')),id DESC)
    SELECT u.id,u.record_data AS record,s.last_login_at AS "lastLogin",s.last_activity_at AS "lastActivity",
     EXISTS(SELECT 1 FROM user_login_days d WHERE d.login=lower(trim(u.record_data->>'login')) AND d.day BETWEEN $1::date AND $2::date) AS "loggedIn"
    FROM accounts u LEFT JOIN user_login_summary s ON s.login=lower(trim(u.record_data->>'login'))
    ORDER BY lower(u.record_data->>'employee'),u.id`,[req.query.from,req.query.to]);
   const users=rows.map(({record,...row})=>({...row,login:record.login,name:record.employee||record.name||record.login,
    roleLabel:userMasterRole(record),location:locationName(record,userMasterRole(record)),
    accountStatus:record.active===false||['false','inactive','disabled','terminated'].includes(String(record.status||record.active||'').toLowerCase())?'Disabled':'Enabled'}));
   const inactive=users.filter(row=>!row.loggedIn);
   res.json({users:inactive,totalUsers:users.length,inactiveUsers:inactive.length,loggedInUsers:users.length-inactive.length,completeFrom,from:req.query.from,to:req.query.to});
  }catch(error){next(error)}
 });
}
