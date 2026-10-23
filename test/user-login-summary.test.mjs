import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {initializeLoginHistory,registerLoginHistoryRoutes} from '../user-login-history.mjs';
import {loginActivityRows} from '../src/login-activity.mjs';

test('latest login and exact-account activity survive cleanup without inventing logins or merging names',async()=>{
  const db=new PGlite();
  const pool={query:(sql,params)=>params?db.query(sql,params):db.exec(sql).then(results=>results.at(-1))};
  const iso=value=>value?new Date(value).toISOString():null;
  const summary=async login=>(await db.query('SELECT * FROM user_login_summary WHERE login=$1',[login])).rows[0];
  let handler;
  registerLoginHistoryRoutes({get(_path,...handlers){handler=handlers.at(-1);}},
    {pool,requireSuper(){},requireAdministrator(){},locationName:record=>record.site});
  const read=async(query={period:'all'})=>{let response;await handler({query},{set(){},json(body){response=body;}},error=>{throw error;});return response;};
  try{
    await db.exec(`
      CREATE TABLE auth_sessions(session_public_id TEXT PRIMARY KEY,login_name TEXT,employee_name TEXT,permissions JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ,last_seen_at TIMESTAMPTZ,device_id TEXT DEFAULT '',ip_address TEXT DEFAULT '',user_agent TEXT DEFAULT '');
      CREATE TABLE user_session_activity(session_id TEXT PRIMARY KEY,actor_login TEXT,actor_name TEXT,
        started_at TIMESTAMPTZ,last_seen_at TIMESTAMPTZ,active_seconds BIGINT DEFAULT 0);
      CREATE TABLE app_metadata(key TEXT PRIMARY KEY,value TEXT);
      CREATE TABLE master_records(id TEXT,master_name TEXT,record_data JSONB);
      CREATE TABLE maintenance_requests(requester_login TEXT,created_at TIMESTAMPTZ,accepted_by TEXT);
      CREATE TABLE maintenance_daily_remarks(author_login TEXT,created_at TIMESTAMPTZ);
      CREATE TABLE production_first_trip_acceptances(production_first_trip_login TEXT,created_at TIMESTAMPTZ,production_first_trip_at TIMESTAMPTZ);
      CREATE TABLE audit_events(actor_login TEXT,occurred_at TIMESTAMPTZ,outcome TEXT,session_id TEXT,event_type TEXT);
      CREATE TABLE user_login_history(session_id TEXT PRIMARY KEY,login TEXT NOT NULL,name TEXT NOT NULL DEFAULT '',
        started_at TIMESTAMPTZ NOT NULL,last_seen_at TIMESTAMPTZ NOT NULL,device_id TEXT NOT NULL DEFAULT '',ip_address TEXT NOT NULL DEFAULT '',user_agent TEXT NOT NULL DEFAULT '');
      INSERT INTO master_records VALUES
        ('1','Users & employees','{"login":"ALICE","employee":"Same Name","site":"A","password":"do-not-expose"}'),
        ('2','Users & employees','{"login":"BOB","employee":"Same Name","site":"A"}'),
        ('3','Users & employees','{"login":"CREATOR","employee":"Creator","site":"B"}'),
        ('4','Users & employees','{"login":"REMARKER","employee":"Remarker","site":"B"}'),
        ('5','Users & employees','{"login":"FIRSTTRIP","employee":"Production","site":"B"}'),
        ('6','Users & employees','{"login":"AUDITOR","employee":"Auditor","site":"B"}'),
        ('7','Users & employees','{"login":"ACTIVITY","employee":"Activity only","site":"B"}');
      INSERT INTO auth_sessions(session_public_id,login_name,employee_name,created_at,last_seen_at)
        VALUES ('one',' Alice ','Same Name','2020-01-01T01:00Z','2020-01-02T02:00Z');
      -- Legacy activity-window backfill had a reset start and wrong casing.
      INSERT INTO user_login_history(session_id,login,started_at,last_seen_at)
        VALUES('one',' ALICE ','2020-01-03T01:00Z','2020-01-03T01:00Z'),
          ('ended',' ALICE ','2019-12-01T01:00Z','2019-12-01T02:00Z');
      INSERT INTO user_session_activity VALUES
        ('reset',' Alice ','Same Name','2020-01-03T01:00Z','2020-01-03T01:00Z',0),
        ('used',' Activity ','Activity only','2020-01-01T01:00Z','2020-01-02T01:00Z',60);
      INSERT INTO maintenance_requests VALUES (' Creator ','2020-01-01T01:00Z','Same Name');
      INSERT INTO maintenance_daily_remarks VALUES (' Remarker ','2020-01-02T01:00Z');
      INSERT INTO production_first_trip_acceptances VALUES (' FirstTrip ','2020-01-03T01:00Z','2019-12-15T01:00Z');
      INSERT INTO audit_events VALUES (' Auditor ','2020-01-04T01:00Z','Success','','Workflow timeline'),
        ('BOB','2020-01-04T01:00Z','Failure','','Security'),
        ('BOB','2020-01-04T01:00Z','Success','','Administration');
    `);
    await initializeLoginHistory(pool);
    assert.equal(iso((await summary('alice')).last_login_at),'2020-01-01T01:00:00.000Z');
    assert.equal(iso((await summary('alice')).last_activity_at),'2020-01-02T02:00:00.000Z','export reset is not activity');
    const initial=(await read()).users;
    for(const login of ['CREATOR','REMARKER','FIRSTTRIP','AUDITOR','ACTIVITY']){
      const row=initial.find(row=>row.login===login);
      assert.equal(row.lastLogin,null,`${login}: a saved action must not become a login`);
      assert.ok(row.lastActivity,`${login}: recover exact-account historical use`);
    }
    assert.equal(iso(initial.find(row=>row.login==='FIRSTTRIP').lastActivity),'2020-01-03T01:00:00.000Z','recording time, not user-entered trip time');
    assert.deepEqual(loginActivityRows(initial,'never').map(row=>row.login),['BOB'],'same display name is not the same account');
    assert.equal(initial.find(row=>row.login==='ALICE').loginCount,2,'normalized history counts distinct sessions');
    assert.ok(!JSON.stringify(initial).includes('do-not-expose'));
    assert.ok(!JSON.stringify(initial).includes('session_public_id'));
    assert.equal((await read({period:'custom',from:'2019-12-01',to:'2020-01-01',login:' Alice '})).sessions.length,2);

    await db.exec(`INSERT INTO auth_sessions(session_public_id,login_name,employee_name,created_at,last_seen_at)
        VALUES ('two','ALICE','Same Name','2020-02-01T01:00Z','2020-02-01T01:00Z');
      UPDATE auth_sessions SET last_seen_at='2020-02-02T01:00Z' WHERE session_public_id='two';
      UPDATE auth_sessions SET last_seen_at='2020-01-01T01:00Z' WHERE session_public_id='two';
      INSERT INTO user_session_activity VALUES ('live','ALICE','Same Name','2020-02-01T01:00Z','2020-02-03T01:00Z',90);
      UPDATE user_session_activity SET started_at='2020-02-04T01:00Z',last_seen_at='2020-02-04T01:00Z',active_seconds=0 WHERE session_id='live';
      INSERT INTO maintenance_daily_remarks VALUES('REMARKER','2020-02-02T01:00Z');
      INSERT INTO audit_events VALUES('AUDITOR','2020-02-02T01:00Z','Success','authenticated','Administration');
      INSERT INTO maintenance_requests VALUES('CREATOR','2020-02-02T01:00Z','Same Name');
      INSERT INTO production_first_trip_acceptances VALUES('FIRSTTRIP','2020-02-02T01:00Z','2020-02-01T01:00Z');
      INSERT INTO maintenance_requests VALUES('  ','2020-02-02T01:00Z','Same Name');`);
    assert.equal(iso((await summary('alice')).last_login_at),'2020-02-01T01:00:00.000Z');
    assert.equal(iso((await summary('alice')).last_activity_at),'2020-02-03T01:00:00.000Z','out-of-order updates and exports do not overwrite actual use');
    for(const login of ['creator','remarker','firsttrip','auditor'])assert.equal(iso((await summary(login)).last_activity_at),'2020-02-02T01:00:00.000Z');
    // Actual use after an export still advances the summary without a new login.
    await db.exec(`UPDATE user_session_activity SET last_seen_at='2020-02-05T01:00Z',active_seconds=60 WHERE session_id='live'`);
    assert.equal(iso((await summary('alice')).last_activity_at),'2020-02-05T01:00:00.000Z');
    assert.equal((await db.query("SELECT * FROM user_login_history WHERE session_id IN ('used','reset','live')")).rows.length,0);
    const historical=(await read({period:'custom',from:'2020-01-01',to:'2020-01-01'})).users;
    assert.equal(historical.find(row=>row.login==='ALICE').activity,'Active in period','later activity must not hide a retained session overlapping the selected period');

    const before=JSON.stringify((await db.query('SELECT * FROM user_login_summary ORDER BY login')).rows);
    await db.exec(`DELETE FROM user_login_history; DELETE FROM user_session_activity; DELETE FROM auth_sessions;
      DELETE FROM audit_events; DELETE FROM maintenance_requests; DELETE FROM maintenance_daily_remarks; DELETE FROM production_first_trip_acceptances;`);
    await initializeLoginHistory(pool);
    assert.equal(JSON.stringify((await db.query('SELECT * FROM user_login_summary ORDER BY login')).rows),before,'all cleanup paths and restart preserve latest timestamps');
    const after=(await read()).users;
    assert.equal(after.find(row=>row.login==='ALICE').loginCount,0,'retained detail count is not a lifetime count');
    assert.equal(iso(after.find(row=>row.login==='ALICE').lastLogin),'2020-02-01T01:00:00.000Z');
    assert.equal(iso(after.find(row=>row.login==='ALICE').lastActivity),'2020-02-05T01:00:00.000Z');
    assert.deepEqual(loginActivityRows(after,'never').map(row=>row.login),['BOB']);
  }finally{await db.close();}
});
