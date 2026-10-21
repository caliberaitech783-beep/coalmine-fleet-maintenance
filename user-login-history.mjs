// Detailed sessions may be purged. The small per-login summary must survive
// that cleanup, logout and credential expiry; it stores no credentials/devices.
export async function initializeLoginHistory(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_login_history (
      session_id TEXT PRIMARY KEY, login TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
      started_at TIMESTAMPTZ NOT NULL, last_seen_at TIMESTAMPTZ NOT NULL,
      device_id TEXT NOT NULL DEFAULT '', ip_address TEXT NOT NULL DEFAULT '', user_agent TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS user_login_history_login_idx ON user_login_history (login,started_at DESC);
    CREATE TABLE IF NOT EXISTS user_login_summary (
      login TEXT PRIMARY KEY CHECK (login=lower(trim(login)) AND login<>''),
      last_login_at TIMESTAMPTZ, last_activity_at TIMESTAMPTZ
    );
    CREATE OR REPLACE FUNCTION preserve_user_login_activity(account TEXT, signed_in TIMESTAMPTZ, seen TIMESTAMPTZ)
      RETURNS void LANGUAGE plpgsql AS $summary$
    BEGIN
      IF COALESCE(trim(account),'')='' OR (signed_in IS NULL AND seen IS NULL) THEN RETURN; END IF;
      INSERT INTO user_login_summary(login,last_login_at,last_activity_at)
        VALUES(lower(trim(account)),signed_in,GREATEST(signed_in,seen))
      ON CONFLICT(login) DO UPDATE SET
        last_login_at=GREATEST(user_login_summary.last_login_at,EXCLUDED.last_login_at),
        last_activity_at=GREATEST(user_login_summary.last_activity_at,EXCLUDED.last_activity_at)
      WHERE EXCLUDED.last_login_at>user_login_summary.last_login_at
        OR (user_login_summary.last_login_at IS NULL AND EXCLUDED.last_login_at IS NOT NULL)
        OR EXCLUDED.last_activity_at>user_login_summary.last_activity_at
        OR (user_login_summary.last_activity_at IS NULL AND EXCLUDED.last_activity_at IS NOT NULL);
    END $summary$;
    CREATE OR REPLACE FUNCTION summarize_user_login_history() RETURNS trigger LANGUAGE plpgsql AS $summary$
    BEGIN
      PERFORM preserve_user_login_activity(NEW.login,NEW.started_at,NEW.last_seen_at);
      RETURN NEW;
    END $summary$;
    CREATE OR REPLACE TRIGGER user_login_history_summary AFTER INSERT OR UPDATE ON user_login_history
      FOR EACH ROW EXECUTE FUNCTION summarize_user_login_history();
    CREATE OR REPLACE FUNCTION record_user_login_history() RETURNS trigger LANGUAGE plpgsql AS $history$
    BEGIN
      INSERT INTO user_login_history (session_id,login,name,started_at,last_seen_at,device_id,ip_address,user_agent)
      VALUES (NEW.session_public_id,lower(trim(NEW.login_name)),NEW.employee_name,NEW.created_at,NEW.last_seen_at,NEW.device_id,NEW.ip_address,NEW.user_agent)
      ON CONFLICT (session_id) DO UPDATE SET login=EXCLUDED.login,name=EXCLUDED.name,started_at=EXCLUDED.started_at,
        last_seen_at=GREATEST(user_login_history.last_seen_at,EXCLUDED.last_seen_at),
        device_id=EXCLUDED.device_id,ip_address=EXCLUDED.ip_address,user_agent=EXCLUDED.user_agent;
      RETURN NEW;
    END $history$;
    CREATE OR REPLACE TRIGGER auth_session_login_history AFTER INSERT OR UPDATE ON auth_sessions
      FOR EACH ROW EXECUTE FUNCTION record_user_login_history();
    -- Activity windows are reset by audit export: their start is NOT a login.
    -- Recover true login timestamps from authentication sessions first.
    INSERT INTO user_login_history (session_id,login,name,started_at,last_seen_at,device_id,ip_address,user_agent)
      SELECT session_public_id,lower(trim(login_name)),employee_name,created_at,last_seen_at,device_id,ip_address,user_agent
      FROM auth_sessions ON CONFLICT (session_id) DO UPDATE SET login=EXCLUDED.login,name=EXCLUDED.name,started_at=EXCLUDED.started_at,
        last_seen_at=EXCLUDED.last_seen_at;
    UPDATE user_login_history SET login=lower(trim(login)) WHERE login<>lower(trim(login));
    SELECT preserve_user_login_activity(login,MAX(started_at),MAX(last_seen_at)) FROM user_login_history GROUP BY login;

    CREATE OR REPLACE FUNCTION summarize_user_session_activity() RETURNS trigger LANGUAGE plpgsql AS $activity$
    BEGIN
      -- Scheduled exports reset both timestamps and seconds. They are not use.
      IF TG_OP='UPDATE' THEN
        IF NEW.started_at IS DISTINCT FROM OLD.started_at OR NEW.active_seconds<OLD.active_seconds THEN RETURN NEW; END IF;
      END IF;
      PERFORM preserve_user_login_activity(NEW.actor_login,NULL,NEW.last_seen_at);
      RETURN NEW;
    END $activity$;
    CREATE OR REPLACE TRIGGER user_session_activity_summary AFTER INSERT OR UPDATE ON user_session_activity
      FOR EACH ROW EXECUTE FUNCTION summarize_user_session_activity();
    SELECT preserve_user_login_activity(lower(trim(actor_login)),NULL,MAX(last_seen_at))
      FROM user_session_activity WHERE last_seen_at>started_at GROUP BY lower(trim(actor_login));

    -- Only exact account identifiers count. Display names are not identities.
    -- These saved actions establish activity, never an inferred login time.
    CREATE OR REPLACE FUNCTION summarize_user_saved_action() RETURNS trigger LANGUAGE plpgsql AS $activity$
    DECLARE account TEXT; seen TIMESTAMPTZ;
    BEGIN
      IF TG_TABLE_NAME='audit_events' THEN
        IF NEW.outcome<>'Success' OR (COALESCE(NEW.session_id,'')='' AND NEW.event_type<>'Workflow timeline') THEN RETURN NEW; END IF;
        account:=NEW.actor_login; seen:=NEW.occurred_at;
      ELSE
        account:=to_jsonb(NEW)->>TG_ARGV[0]; seen:=NEW.created_at;
      END IF;
      PERFORM preserve_user_login_activity(account,NULL,seen);
      RETURN NEW;
    END $activity$;
    CREATE OR REPLACE TRIGGER maintenance_request_user_activity AFTER INSERT ON maintenance_requests
      FOR EACH ROW EXECUTE FUNCTION summarize_user_saved_action('requester_login');
    CREATE OR REPLACE TRIGGER maintenance_remark_user_activity AFTER INSERT ON maintenance_daily_remarks
      FOR EACH ROW EXECUTE FUNCTION summarize_user_saved_action('author_login');
    CREATE OR REPLACE TRIGGER first_trip_user_activity AFTER INSERT ON production_first_trip_acceptances
      FOR EACH ROW EXECUTE FUNCTION summarize_user_saved_action('production_first_trip_login');
    CREATE OR REPLACE TRIGGER audit_user_activity AFTER INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION summarize_user_saved_action();
    SELECT preserve_user_login_activity(login,NULL,MAX(seen)) FROM (
      SELECT lower(trim(requester_login)) AS login,created_at AS seen FROM maintenance_requests
      UNION ALL SELECT lower(trim(author_login)),created_at FROM maintenance_daily_remarks
      UNION ALL SELECT lower(trim(production_first_trip_login)),created_at FROM production_first_trip_acceptances
      UNION ALL SELECT lower(trim(actor_login)),occurred_at FROM audit_events
        WHERE outcome='Success' AND (COALESCE(session_id,'')<>'' OR event_type='Workflow timeline')
    ) evidence GROUP BY login;
    INSERT INTO app_metadata (key,value) VALUES ('login_history_since',NOW()::text) ON CONFLICT (key) DO NOTHING;
  `);
}

export function loginHistoryRange(query={}, now=new Date()) {
  if(query.period==='24h')return {from:new Date(now.getTime()-86400000),to:now};
  // "all": every retained session; the durable summary is not date-limited.
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
        summary.last_login_at AS "lastLogin",summary.last_activity_at AS "lastActivity",
        (SELECT COUNT(*)::int FROM user_login_history h WHERE h.login=lower(trim(u.record_data->>'login')) AND h.started_at>=$1 AND h.started_at<$2) AS "loginCount",
        (SELECT COUNT(*)::int FROM user_login_history h WHERE h.login=lower(trim(u.record_data->>'login')) AND h.started_at<$2 AND h.last_seen_at>=$1) AS "sessionCount",
        (SELECT COUNT(DISTINCT (h.started_at AT TIME ZONE 'Asia/Kolkata')::date)::int FROM user_login_history h
          WHERE h.login=lower(trim(u.record_data->>'login')) AND h.started_at>=$1 AND h.started_at<$2) AS "loginDays"
        FROM master_records u LEFT JOIN user_login_summary summary ON summary.login=lower(trim(u.record_data->>'login'))
        WHERE u.master_name='Users & employees' AND COALESCE(trim(u.record_data->>'login'),'')<>''
        ORDER BY lower(u.record_data->>'employee'),u.id`,params);
      res.json({users:rows.map(({record,...row})=>({...row,login:record.login,name:record.employee,
        roleLabel:record.assignedRole||record.userType||'User',location:locationName(record,record.assignedRole||record.userType),
        activity:row.lastActivity&&new Date(row.lastActivity)>=range.from&&new Date(row.lastActivity)<range.to?'Active in period':row.lastActivity||row.lastLogin?'No activity in period':'No recorded activity'})),...range,trackingSince:metadata[0]?.value});
    }catch(error){next(error);}
  });
}
