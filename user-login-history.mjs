// Separate from exportable audit records and expiring authentication credentials.
export async function initializeLoginHistory(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_login_history (
      session_id TEXT PRIMARY KEY, login TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
      started_at TIMESTAMPTZ NOT NULL, last_seen_at TIMESTAMPTZ NOT NULL,
      device_id TEXT NOT NULL DEFAULT '', ip_address TEXT NOT NULL DEFAULT '', user_agent TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS user_login_history_login_idx ON user_login_history (login,started_at DESC);
    CREATE OR REPLACE FUNCTION record_user_login_history() RETURNS trigger LANGUAGE plpgsql AS $history$
    BEGIN
      INSERT INTO user_login_history (session_id,login,name,started_at,last_seen_at,device_id,ip_address,user_agent)
      VALUES (NEW.session_public_id,lower(trim(NEW.login_name)),NEW.employee_name,NEW.created_at,NEW.last_seen_at,NEW.device_id,NEW.ip_address,NEW.user_agent)
      ON CONFLICT (session_id) DO UPDATE SET last_seen_at=EXCLUDED.last_seen_at,
        device_id=EXCLUDED.device_id,ip_address=EXCLUDED.ip_address,user_agent=EXCLUDED.user_agent;
      RETURN NEW;
    END $history$;
    CREATE OR REPLACE TRIGGER auth_session_login_history AFTER INSERT OR UPDATE ON auth_sessions
      FOR EACH ROW EXECUTE FUNCTION record_user_login_history();
    INSERT INTO user_login_history (session_id,login,name,started_at,last_seen_at,device_id,ip_address,user_agent)
      SELECT session_id,lower(trim(actor_login)),actor_name,started_at,last_seen_at,device_id,ip_address,user_agent
      FROM user_session_activity ON CONFLICT (session_id) DO NOTHING;
    INSERT INTO user_login_history (session_id,login,name,started_at,last_seen_at,device_id,ip_address,user_agent)
      SELECT session_public_id,lower(trim(login_name)),employee_name,created_at,last_seen_at,device_id,ip_address,user_agent
      FROM auth_sessions ON CONFLICT (session_id) DO UPDATE SET started_at=EXCLUDED.started_at,
        last_seen_at=GREATEST(user_login_history.last_seen_at,EXCLUDED.last_seen_at);
    INSERT INTO app_metadata (key,value) VALUES ('login_history_since',NOW()::text) ON CONFLICT (key) DO NOTHING;
  `);
}

export function loginHistoryRange(query={}, now=new Date()) {
  if(query.period==='24h')return {from:new Date(now.getTime()-86400000),to:now};
  // "all": every retained login, so the Never logged in view needs no dates.
  if(query.period==='all')return {from:new Date('2000-01-01T00:00:00Z'),to:now};
  if(query.period!=='custom')return {from:new Date(now.getTime()-7*86400000),to:now};
  const valid=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')) && !Number.isNaN(Date.parse(`${value}T00:00:00+05:30`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
  if(!valid(query.from)||!valid(query.to))throw new Error('Select valid From and To dates.');
  const from=new Date(`${query.from}T00:00:00+05:30`);
  const to=new Date(new Date(`${query.to}T00:00:00+05:30`).getTime()+86400000);
  if(to<=from)throw new Error('To date must be on or after From date.');
  if(to-from>366*86400000)throw new Error('Select a range of up to 366 days.');
  return {from,to};
}

export function registerLoginHistoryRoutes(app,{pool,requireSuper,requireAdministrator,locationName}) {
  app.get('/api/user-login-history',requireSuper,requireAdministrator,async(req,res,next)=>{
    let range;
    try{range=loginHistoryRange(req.query);}catch(error){return res.status(400).json({error:error.message});}
    try{
      res.set('Cache-Control','no-store');
      const params=[range.from,range.to];
      const {rows:metadata}=await pool.query("SELECT value FROM app_metadata WHERE key='login_history_since'");
      if(req.query.login){
        const {rows}=await pool.query(`SELECT h.session_id AS "sessionId",h.login,h.name,h.started_at AS "createdAt",
          h.last_seen_at AS "lastSeenAt",h.device_id AS "deviceId",h.ip_address AS "ipAddress",h.user_agent AS "userAgent",
          EXISTS(SELECT 1 FROM auth_sessions s WHERE s.session_public_id=h.session_id
            AND s.last_seen_at>NOW()-INTERVAL '15 minutes' AND s.created_at>NOW()-INTERVAL '30 days') AS active
          FROM user_login_history h WHERE h.login=$3 AND h.started_at<$2 AND h.last_seen_at>=$1
          ORDER BY h.started_at DESC`,[...params,String(req.query.login).trim().toLowerCase()]);
        return res.json({sessions:rows,...range,trackingSince:metadata[0]?.value});
      }
      const {rows}=await pool.query(`SELECT u.id,u.record_data AS record,
        (SELECT MAX(h.started_at) FROM user_login_history h WHERE h.login=lower(trim(u.record_data->>'login'))) AS "lastLogin",
        (SELECT COUNT(*)::int FROM user_login_history h WHERE h.login=lower(trim(u.record_data->>'login')) AND h.started_at>=$1 AND h.started_at<$2) AS "loginCount",
        (SELECT COUNT(*)::int FROM user_login_history h WHERE h.login=lower(trim(u.record_data->>'login')) AND h.started_at<$2 AND h.last_seen_at>=$1) AS "sessionCount",
        (SELECT COUNT(DISTINCT (h.started_at AT TIME ZONE 'Asia/Kolkata')::date)::int FROM user_login_history h
          WHERE h.login=lower(trim(u.record_data->>'login')) AND h.started_at>=$1 AND h.started_at<$2) AS "loginDays"
        FROM master_records u WHERE u.master_name='Users & employees' AND COALESCE(trim(u.record_data->>'login'),'')<>''
        ORDER BY lower(u.record_data->>'employee'),u.id`,params);
      res.json({users:rows.map(({record,...row})=>({...row,login:record.login,name:record.employee,
        roleLabel:record.assignedRole||record.userType||'User',location:locationName(record,record.assignedRole||record.userType),
        activity:row.sessionCount?'Active in period':row.lastLogin?'No activity in period':'No recorded login'})),...range,trackingSince:metadata[0]?.value});
    }catch(error){next(error);}
  });
}
