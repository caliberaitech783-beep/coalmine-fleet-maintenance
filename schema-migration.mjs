import {createHash} from 'node:crypto';

// Staging and production share a database. A slot restart must not replay DDL
// against live reads when its schema is already installed by the other slot.
export async function applySchemaMigration(pool,sql,repairs=[]) {
  const fingerprint=createHash('sha256').update([sql,...repairs.map(fn=>fn.toString())].join('\n').replace(/\r\n/g,'\n')).digest('hex');
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='2s'");
    await client.query('SELECT pg_advisory_xact_lock(783,1)');
    const exists=(await client.query("SELECT to_regclass('app_metadata') AS name")).rows[0]?.name;
    const installed=exists?(await client.query("SELECT value FROM app_metadata WHERE key='schema_fingerprint'")).rows[0]?.value:null;
    if(installed===fingerprint){await client.query('COMMIT');return {skipped:true,fingerprint};}
    await client.query(sql);
    for(const repair of repairs)await repair(client);
    await client.query(`INSERT INTO app_metadata(key,value,updated_at) VALUES ('schema_fingerprint',$1,NOW())
      ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,[fingerprint]);
    await client.query('COMMIT');
    return {skipped:false,fingerprint};
  } catch(error) {await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally {client.release();}
}
