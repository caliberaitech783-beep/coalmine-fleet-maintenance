// New logins replace older logins in the same application. Opening another
// authorized workspace must not kick a user out of the first workspace.
export async function initializeSingleLogin(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS user_current_sessions(
   login TEXT NOT NULL CHECK(login=lower(trim(login)) AND login<>''),
   application TEXT NOT NULL DEFAULT 'BDMS',
   session_id TEXT NOT NULL UNIQUE REFERENCES auth_sessions(session_public_id) ON DELETE CASCADE,
   PRIMARY KEY(login,application));
 ALTER TABLE user_current_sessions ADD COLUMN IF NOT EXISTS application TEXT NOT NULL DEFAULT 'BDMS';
 UPDATE user_current_sessions c SET application=COALESCE(NULLIF(s.permissions->>'application',''),'BDMS')
 FROM auth_sessions s WHERE s.session_public_id=c.session_id;
 ALTER TABLE user_current_sessions DROP CONSTRAINT IF EXISTS user_current_sessions_pkey;
 ALTER TABLE user_current_sessions ADD PRIMARY KEY(login,application);
 CREATE OR REPLACE FUNCTION select_current_user_session() RETURNS trigger LANGUAGE plpgsql AS $single$
 BEGIN
  IF COALESCE(trim(NEW.login_name),'')<>'' THEN
   INSERT INTO user_current_sessions(login,application,session_id)
    VALUES(lower(trim(NEW.login_name)),COALESCE(NULLIF(NEW.permissions->>'application',''),'BDMS'),NEW.session_public_id)
    ON CONFLICT(login,application) DO UPDATE SET session_id=EXCLUDED.session_id;
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
