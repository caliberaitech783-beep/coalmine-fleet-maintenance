// New logins replace older logins in the same application. Opening another
// authorized workspace must not kick a user out of the first workspace.
// Owner, 28 Nov 2026: the logins in SESSION_LIMIT_EXCEPTIONS (default mohitchadda=3) keep their newest
// N sign-ins per application (Fleet, Accounts, Tender, MIS, HR …) at once; everyone else keeps one.
export const DEFAULT_SESSION_LIMIT_EXCEPTIONS='mohitchadda=3';
export function parseSessionLimitExceptions(value=DEFAULT_SESSION_LIMIT_EXCEPTIONS){
 const limits=new Map();
 for(const part of String(value??'').split(/[,;\s]+/)){
  const match=/^([^=]+)=(\d+)$/.exec(part.trim());
  if(!match)continue;
  const login=match[1].trim().toLowerCase(),allowed=Math.min(10,Math.max(1,Number(match[2])));
  if(login)limits.set(login,allowed);
 }
 return [...limits].map(([login,allowed])=>({login,allowed}));
}
export async function initializeSingleLogin(pool,{exceptions=process.env.SESSION_LIMIT_EXCEPTIONS??DEFAULT_SESSION_LIMIT_EXCEPTIONS}={}){
 await pool.query(`CREATE TABLE IF NOT EXISTS user_current_sessions(
   login TEXT NOT NULL CHECK(login=lower(trim(login)) AND login<>''),
   application TEXT NOT NULL DEFAULT 'BDMS',
   session_id TEXT NOT NULL UNIQUE REFERENCES auth_sessions(session_public_id) ON DELETE CASCADE,
   PRIMARY KEY(session_id));
 ALTER TABLE user_current_sessions ADD COLUMN IF NOT EXISTS application TEXT NOT NULL DEFAULT 'BDMS';
 ALTER TABLE user_current_sessions ADD COLUMN IF NOT EXISTS selected_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
 -- A running number orders sign-ins exactly, even two in the same instant (a clock can tie).
 CREATE SEQUENCE IF NOT EXISTS user_current_sessions_order;
 ALTER TABLE user_current_sessions ADD COLUMN IF NOT EXISTS selected_order BIGINT NOT NULL DEFAULT nextval('user_current_sessions_order');
 UPDATE user_current_sessions c SET application=COALESCE(NULLIF(s.permissions->>'application',''),'BDMS')
 FROM auth_sessions s WHERE s.session_public_id=c.session_id;
 DELETE FROM user_current_sessions WHERE session_id IS NULL;
 ALTER TABLE user_current_sessions DROP CONSTRAINT IF EXISTS user_current_sessions_pkey;
 ALTER TABLE user_current_sessions ADD PRIMARY KEY(session_id);
 CREATE INDEX IF NOT EXISTS user_current_sessions_login_application ON user_current_sessions(login,application,selected_order DESC);
 CREATE TABLE IF NOT EXISTS session_limit_exceptions(
   login TEXT PRIMARY KEY CHECK(login=lower(trim(login)) AND login<>''),
   max_sessions INTEGER NOT NULL CHECK(max_sessions BETWEEN 1 AND 10));
 CREATE OR REPLACE FUNCTION select_current_user_session() RETURNS trigger LANGUAGE plpgsql AS $single$
 DECLARE wanted_login TEXT; wanted_application TEXT; allowed INTEGER;
 BEGIN
  wanted_login:=lower(trim(COALESCE(NEW.login_name,'')));
  IF wanted_login<>'' THEN
   wanted_application:=COALESCE(NULLIF(NEW.permissions->>'application',''),'BDMS');
   -- The same lock as createForVerifiedDevice, so concurrent sign-ins of one account take turns.
   PERFORM pg_advisory_xact_lock(hashtext('login:'||wanted_application||':'||wanted_login));
   SELECT max_sessions INTO allowed FROM session_limit_exceptions WHERE login=wanted_login;
   allowed:=GREATEST(1,COALESCE(allowed,1));
   INSERT INTO user_current_sessions(login,application,session_id,selected_at,selected_order)
    VALUES(wanted_login,wanted_application,NEW.session_public_id,clock_timestamp(),nextval('user_current_sessions_order'))
    ON CONFLICT(session_id) DO UPDATE SET selected_at=EXCLUDED.selected_at,selected_order=EXCLUDED.selected_order;
   DELETE FROM user_current_sessions WHERE login=wanted_login AND application=wanted_application
    AND session_id NOT IN (SELECT session_id FROM user_current_sessions WHERE login=wanted_login AND application=wanted_application
     ORDER BY selected_order DESC LIMIT allowed);
  END IF;
  RETURN NEW;
 END $single$;
 CREATE OR REPLACE TRIGGER auth_session_single_login AFTER INSERT ON auth_sessions
  FOR EACH ROW EXECUTE FUNCTION select_current_user_session();
 INSERT INTO user_current_sessions(login,application,session_id)
 SELECT DISTINCT ON(lower(trim(login_name)),COALESCE(NULLIF(permissions->>'application',''),'BDMS'))
 lower(trim(login_name)),COALESCE(NULLIF(permissions->>'application',''),'BDMS'),session_public_id FROM auth_sessions
 WHERE COALESCE(trim(login_name),'')<>'' AND NOT EXISTS(SELECT 1 FROM app_metadata WHERE key='single_session_initialized')
 ORDER BY lower(trim(login_name)),COALESCE(NULLIF(permissions->>'application',''),'BDMS'),created_at DESC,last_seen_at DESC,session_public_id DESC
 ON CONFLICT DO NOTHING;
 INSERT INTO app_metadata(key,value) VALUES('single_session_initialized',NOW()::text) ON CONFLICT(key) DO NOTHING;`);
 // The list follows the setting at every start: a login taken off it goes back to one sign-in for its next one.
 const wanted=parseSessionLimitExceptions(exceptions);
 await pool.query('DELETE FROM session_limit_exceptions WHERE NOT (login = ANY($1::text[]))',[wanted.map(item=>item.login)]);
 for(const {login,allowed} of wanted)await pool.query('INSERT INTO session_limit_exceptions(login,max_sessions) VALUES($1,$2) ON CONFLICT(login) DO UPDATE SET max_sessions=EXCLUDED.max_sessions',[login,allowed]);
}

// Return one row per account while retaining the current browser's action target.
export function groupCurrentUserSessions(rows,currentToken){
 const accounts=new Map();
 for(const row of rows){
  const key=String(row.login||'').trim().toLowerCase()||row.sessionId;
  const previous=accounts.get(key);
  if(!previous){accounts.set(key,{...row});continue;}
  const latest=new Date(row.lastSeenAt||row.createdAt)>new Date(previous.lastSeenAt||previous.createdAt)?row.lastSeenAt:previous.lastSeenAt;
  const representative=row.token===currentToken?row:previous.token===currentToken?previous:new Date(row.createdAt)>new Date(previous.createdAt)?row:previous;
  accounts.set(key,{...representative,lastSeenAt:latest});
 }
 return [...accounts.values()];
}
