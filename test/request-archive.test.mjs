import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {archiveSchemaSql,previewRequestArchive,archiveRequests,restoreRequestArchive} from '../request-archive.mjs';
import {requestsVisibleToSession} from '../mis-request-visibility.mjs';
import {readFileSync} from 'node:fs';

test('archive endpoints require administrator access and explicit actions',()=>{
  const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  for(const route of ["app.get('/api/request-archives/preview'","app.get('/api/request-archives'","app.post('/api/request-archives'","app.post('/api/request-archives/:batchId/restore'"]){
    assert.ok(source.includes(`${route},requireSession,requireAdministrator,`));
  }
  assert.ok(source.includes('FROM maintenance_requests WHERE archived_at IS NULL AND requester_login=$1'));
  assert.ok(source.includes('FROM maintenance_requests WHERE archived_at IS NULL ORDER BY created_at DESC'));
  assert.ok(source.includes("FROM maintenance_requests WHERE archived_at IS NULL AND verified_at IS NULL AND ("));
});

test('archive cutoff, preserved data, write protection, stale preview and restore',async()=>{
  const db=new PGlite();
  const client={query:async(sql,params)=>{const r=await db.query(sql,params);return {...r,rowCount:r.affectedRows??r.rows.length};},release(){}};
  const pool={connect:async()=>client};
  try{
    await db.exec(`CREATE TABLE maintenance_requests(reference text PRIMARY KEY,site text,status text,
      created_at timestamptz,verified_at timestamptz,verification_status text DEFAULT '',
      closed_at timestamptz,door_number text DEFAULT '',chassis_number text DEFAULT '',complaint text DEFAULT 'retained');
      CREATE TABLE remarks(ref text REFERENCES maintenance_requests(reference) ON DELETE CASCADE,remark text);
      ${archiveSchemaSql}`);
    for(const [ref,site,status,date,verified,vstatus] of [
      ['old','A','Closed','2026-09-29T23:59:59+05:30',null,''],
      ['open','B','Accepted','2026-09-01T00:00:00+05:30',null,''],
      ['boundary','A','Closed','2026-09-30T00:00:00+05:30',null,''],
      ['later','B','Closed','2026-10-01T00:00:00+05:30',null,''],
      ['verified','A','Closed','2026-09-01T00:00:00+05:30','2026-09-02T00:00:00Z','Verified'],
      ['legacy-verified','B','Closed','2026-09-01T00:00:00+05:30',null,' Verified '],
    ])await client.query('INSERT INTO maintenance_requests(reference,site,status,created_at,verified_at,verification_status) VALUES($1,$2,$3,$4,$5,$6)',[ref,site,status,date,verified,vstatus]);
    await db.exec("INSERT INTO remarks VALUES('old','retained remark')");
    await db.exec("UPDATE maintenance_requests SET door_number='D1' WHERE reference='open'");
    const original=(await client.query('SELECT * FROM maintenance_requests ORDER BY reference')).rows;
    const preview=await previewRequestArchive(client);
    assert.deepEqual(preview.requests.map(r=>r.reference),['old','open']);
    await assert.rejects(archiveRequests(pool,{token:'0'.repeat(64),actor:'admin',reason:'test'}),/changed/);
    const result=await archiveRequests(pool,{token:preview.token,actor:'admin',reason:'Confirmed historical archive'});
    assert.equal(result.count,2);
    assert.equal((await previewRequestArchive(client)).count,0);
    assert.equal((await client.query('SELECT * FROM maintenance_requests')).rows.length,6);
    assert.equal((await client.query('SELECT * FROM remarks')).rows[0].remark,'retained remark');
    await assert.rejects(client.query("UPDATE maintenance_requests SET complaint='changed' WHERE reference='old'"),/read-only/);
    await assert.rejects(client.query("DELETE FROM maintenance_requests WHERE reference='old'"),/read-only/);
    const records=(await client.query('SELECT reference AS ref,archived_at AS "archivedAt" FROM maintenance_requests')).rows;
    for(const role of ['MIS User','Production User'])assert.equal(requestsVisibleToSession(records,{role:'normal',assignedRole:role}).length,4);
    await db.exec("INSERT INTO maintenance_requests(reference,site,status,door_number,created_at) VALUES('new-active','B','Accepted','D1',NOW())");
    await assert.rejects(restoreRequestArchive(pool,{batchId:result.batchId,actor:'admin'}),/overlapping active/);
    await db.exec("UPDATE maintenance_requests SET status='Running BD',verified_at=NOW() WHERE reference='new-active'");
    await assert.rejects(restoreRequestArchive(pool,{batchId:result.batchId,actor:'admin'}),/overlapping active/);
    assert.equal((await client.query('SELECT * FROM maintenance_requests WHERE archived_at IS NOT NULL')).rows.length,2);
    await db.exec("DELETE FROM maintenance_requests WHERE reference='new-active'");
    assert.equal((await restoreRequestArchive(pool,{batchId:result.batchId,actor:'admin'})).count,2);
    assert.equal((await previewRequestArchive(client)).count,2);
    assert.equal((await restoreRequestArchive(pool,{batchId:result.batchId,actor:'admin'})).alreadyRestored,true);
    assert.equal((await client.query('SELECT restored_by FROM request_archive_batches')).rows[0].restored_by,'admin');
    assert.deepEqual((await client.query('SELECT * FROM maintenance_requests ORDER BY reference')).rows,original);
  }finally{await db.close();}
});
