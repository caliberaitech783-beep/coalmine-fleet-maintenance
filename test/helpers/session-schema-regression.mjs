import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createSessionStore} from '../../auth-session.mjs';
import {repairLegacySessionDefaults} from '../../auth-session-schema.mjs';

// Run against a temporary table that shadows auth_sessions on this connection.
// Never modify production sessions, even when verifying on the production DB.
export async function verifySessionSchemaCompatibility(client) {
  await client.query('BEGIN');
  try {
    await client.query(`CREATE TEMPORARY TABLE auth_sessions (
      token UUID PRIMARY KEY, role TEXT NOT NULL, employee_name TEXT NOT NULL,
      login_name TEXT NOT NULL DEFAULT '', user_type TEXT NOT NULL DEFAULT '',
      assigned_role TEXT NOT NULL DEFAULT '', permissions JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    ) ON COMMIT DROP`);
    const store=createSessionStore(client);
    const account={role:'normal',name:'Regression User',login:'session-regression',userType:'Mobile User',assignedRole:'Production User',permissions:{createRequests:true}};
    // Fresh installations do not have the reverted optional column.
    await repairLegacySessionDefaults(client);
    const existingToken=randomUUID();
    await store.create({...account,token:existingToken});
    await client.query("ALTER TABLE auth_sessions ADD COLUMN session_public_id TEXT NOT NULL DEFAULT ''");
    await client.query('CREATE UNIQUE INDEX auth_sessions_public_id_idx ON auth_sessions (session_public_id)');
    await client.query('SAVEPOINT before_legacy_login');
    await assert.rejects(store.create({...account,token:randomUUID()}),error=>error.code==='23505'&&error.constraint==='auth_sessions_public_id_idx');
    await client.query('ROLLBACK TO SAVEPOINT before_legacy_login');
    // Startup and the operational repair can both run safely.
    await repairLegacySessionDefaults(client);
    await repairLegacySessionDefaults(client);
    await client.query(`CREATE TEMP TABLE user_current_sessions(login TEXT PRIMARY KEY,session_id TEXT UNIQUE) ON COMMIT DROP;
      CREATE FUNCTION pg_temp.track_test_login() RETURNS trigger LANGUAGE plpgsql AS $test$
      BEGIN INSERT INTO pg_temp.user_current_sessions VALUES(lower(trim(NEW.login_name)),NEW.session_public_id)
        ON CONFLICT(login) DO UPDATE SET session_id=EXCLUDED.session_id;RETURN NEW;END $test$;
      CREATE TRIGGER track_test_login AFTER INSERT ON auth_sessions FOR EACH ROW EXECUTE FUNCTION pg_temp.track_test_login();
      INSERT INTO user_current_sessions SELECT lower(trim(login_name)),session_public_id FROM auth_sessions;`);
    const tokens=[randomUUID(),randomUUID()];
    for(const [index,token] of tokens.entries())await store.create({...account,login:account.login+'-'+index,token});
    const {rows}=await client.query('SELECT token,session_public_id FROM auth_sessions');
    assert.equal(rows.length,3);
    assert.equal(new Set(rows.map(row=>row.session_public_id)).size,3);
    assert.equal(rows.find(row=>row.token===existingToken).session_public_id,'');
    assert.equal((await store.get(existingToken)).login,account.login);
    for(const [index,token] of tokens.entries())assert.equal((await store.get(token)).login,account.login+'-'+index);
    // Authentication token conflicts retain the existing public identifier.
    await store.create({...account,login:account.login+'-0',token:tokens[0],name:'Updated Regression User'});
    assert.equal((await store.get(tokens[0])).name,'Updated Regression User');
    assert.equal((await client.query('SELECT count(*)::int AS count FROM auth_sessions')).rows[0].count,3);
    return {freshSchema:true,legacyFailureReproduced:true,repeatedLogins:true,existingSessionsPreserved:true,idempotent:true};
  } finally {await client.query('ROLLBACK');}
}
