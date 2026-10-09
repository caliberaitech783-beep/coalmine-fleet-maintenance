import {CDIR_DELETION_SCHEMA} from '../cdir-deletion.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {applySchemaMigration} from '../schema-migration.mjs';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {archiveSchemaSql} from '../request-archive.mjs';
import {repairLegacySessionDefaults} from '../auth-session-schema.mjs';
import {initializeLoginHistory} from '../user-login-history.mjs';
import {EMPLOYEE_TRANSFER_SCHEMA} from '../employee-transfer.mjs';

test('unchanged slot restarts skip DDL; schema changes apply once and failed migrations roll back',async()=>{
  const db=new PGlite();
  let repairs=0,released=0;
  const queries=[];
  // PGlite has one connection, so record the production advisory lock without
  // requiring its unsupported multi-session lock implementation.
  const client={query:async(sql,args)=>{
    queries.push(sql);
    if(sql==='SELECT pg_advisory_xact_lock(783,1)')return {rows:[]};
    if(!args&&sql.includes(';'))return db.exec(sql);
    return db.query(sql,args);
  },release:()=>released++};
  const pool={connect:async()=>client};
  const schema=`CREATE TABLE IF NOT EXISTS app_metadata(key text PRIMARY KEY,value text,updated_at timestamptz);
    CREATE TABLE IF NOT EXISTS requests(id integer PRIMARY KEY,status text);`;
  const repair=async(client)=>{repairs++;await client.query("INSERT INTO requests VALUES (1,'Open') ON CONFLICT(id) DO NOTHING");};
  try {
    const first=await applySchemaMigration(pool,schema,[repair]);
    assert.equal(first.skipped,false);
    const before=queries.length;
    assert.equal((await applySchemaMigration(pool,schema,[repair])).skipped,true);
    assert.ok(!queries.slice(before).includes(schema));
    assert.equal(repairs,1);
    assert.equal((await applySchemaMigration(pool,schema+'\nALTER TABLE requests ADD COLUMN IF NOT EXISTS note text;',[repair])).skipped,false);
    assert.equal(repairs,2);
    const installed=(await db.query("SELECT value FROM app_metadata WHERE key='schema_fingerprint'")).rows[0].value;
    await assert.rejects(applySchemaMigration(pool,schema+'\nALTER TABLE requests ADD COLUMN failed_column text; SELECT nonexistent_column FROM requests;',[repair]));
    assert.equal((await db.query("SELECT value FROM app_metadata WHERE key='schema_fingerprint'")).rows[0].value,installed);
    assert.equal((await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='requests' AND column_name='failed_column'")).rows.length,0);
    assert.equal(released,4);
    assert.ok(queries.includes("SET LOCAL lock_timeout='2s'"));
    assert.ok(queries.includes('SELECT pg_advisory_xact_lock(783,1)'));
  } finally {await db.close();}
});

test('production schema and session repairs install atomically on a fresh database',async()=>{
  const db=new PGlite();
  const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const sql=source.match(/await applySchemaMigration\(pool,`([\s\S]*?)`,\[repairLegacySessionDefaults,initializeLoginHistory\]\)/)[1].replace('${archiveSchemaSql}',()=>archiveSchemaSql).replace('${EMPLOYEE_TRANSFER_SCHEMA}',()=>EMPLOYEE_TRANSFER_SCHEMA).replace('${CDIR_DELETION_SCHEMA}',()=>CDIR_DELETION_SCHEMA);
  const client={query:(sql,args)=>{
    if(sql==='SELECT pg_advisory_xact_lock(783,1)')return Promise.resolve({rows:[]});
    if(!args&&sql.includes(';'))return db.exec(sql);
    return db.query(sql,args);
  },release(){}};
  const pool={connect:async()=>client};
  try {
    assert.equal((await applySchemaMigration(pool,sql,[repairLegacySessionDefaults,initializeLoginHistory])).skipped,false);
    assert.equal((await applySchemaMigration(pool,sql,[repairLegacySessionDefaults,initializeLoginHistory])).skipped,true);
    assert.equal((await db.query("SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_name IN ('maintenance_requests','auth_sessions','user_login_history','crm_notifications','employee_transfers','cdir_deletion_requests')")).rows[0].count,6);
  } finally {await db.close();}
});

test('real PostgreSQL concurrent slot starts run one migration', {skip:!process.env.AUTH_SESSION_TEST_DATABASE_URL},async()=>{
  const pool=new pg.Pool({connectionString:process.env.AUTH_SESSION_TEST_DATABASE_URL,ssl:process.env.AUTH_SESSION_TEST_DATABASE_SSL==='false'?false:{rejectUnauthorized:false},max:3});
  const namespace='migration_'+randomUUID().replaceAll('-','');
  let repairs=0;
  try {
    await pool.query(`CREATE SCHEMA ${namespace}`);
    const scoped={connect:async()=>{const client=await pool.connect();await client.query(`SET search_path TO ${namespace}`);return client;}};
    const sql='CREATE TABLE app_metadata(key text PRIMARY KEY,value text,updated_at timestamptz)';
    const repair=async(client)=>{repairs++;await client.query('SELECT pg_sleep(0.1)');};
    const results=await Promise.all([applySchemaMigration(scoped,sql,[repair]),applySchemaMigration(scoped,sql,[repair])]);
    assert.deepEqual(results.map(r=>r.skipped).sort(),[false,true]);
    assert.equal(repairs,1);
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS ${namespace} CASCADE`);
    await pool.end();
  }
});
