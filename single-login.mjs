// One current authorization pointer per canonical account. Old rows remain for
// backup/history, but no old token can regain access after logout or a restart.
export async function initializeSingleLogin(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS user_current_sessions(
   login TEXT PRIMARY KEY CHECK(login=lower(trim(login)) AND login<>''),
   session_id TEXT NOT NULL UNIQUE REFERENCES auth_sessions(session_public_id) ON DELETE CASCADE);
 CREATE OR REPLACE FUNCTION select_current_user_session() RETURNS trigger LANGUAGE plpgsql AS $single$
 BEGIN
  IF COALESCE(trim(NEW.login_name),'')<>'' THEN
   INSERT INTO user_current_sessions(login,session_id) VALUES(lower(trim(NEW.login_name)),NEW.session_public_id)
    ON CONFLICT(login) DO UPDATE SET session_id=EXCLUDED.session_id;
  END IF;
  RETURN NEW;
 END $single$;
 CREATE OR REPLACE TRIGGER auth_session_single_login AFTER INSERT ON auth_sessions
  FOR EACH ROW EXECUTE FUNCTION select_current_user_session();
 INSERT INTO user_current_sessions(login,session_id)
 SELECT DISTINCT ON(lower(trim(login_name))) lower(trim(login_name)),session_public_id FROM auth_sessions
 WHERE COALESCE(trim(login_name),'')<>'' AND NOT EXISTS(SELECT 1 FROM app_metadata WHERE key='single_session_initialized')
 ORDER BY lower(trim(login_name)),created_at DESC,last_seen_at DESC,session_public_id DESC
 ON CONFLICT DO NOTHING;
 INSERT INTO app_metadata(key,value) VALUES('single_session_initialized',NOW()::text) ON CONFLICT(key) DO NOTHING;`);
}
