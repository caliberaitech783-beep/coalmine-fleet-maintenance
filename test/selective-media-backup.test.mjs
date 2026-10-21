import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yazl from 'yazl';
import {pipeline} from 'node:stream/promises';
import {PGlite} from '@electric-sql/pglite';
import {mediaCutoff,previewMediaBackup,exportMediaBackup,scanMediaZip,restoreMediaBackup} from '../selective-media-backup.mjs';
const png='data:image/png;base64,aGVsbG8=';
const audio='data:audio/webm;base64,dm9pY2U=';
test('cutoff uses midnight IST and rejects normalized invalid dates',()=>{
  assert.equal(mediaCutoff('2026-10-01'),'2026-09-30T18:30:00.000Z');
  assert.throws(()=>mediaCutoff('2026-02-30'));
  assert.throws(()=>mediaCutoff('2026-10-01 OR true'));
});
test('ZIP round trip excludes October and unverified requests and restores missing media atomically',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'media-zip-test-'));const db=new PGlite();
  const pool={query:(sql,args)=>db.query(sql,args),connect:async()=>({query:(sql,args)=>db.query(sql,args),release(){}})};
  try{
    await db.exec(`CREATE TABLE maintenance_requests(id bigint primary key,reference text,verified_at timestamptz,opening_meter_file text default '',closing_meter_file text default '',first_trip_card_image text default '',complaint_audio text default '',maintenance_audio text default '',opening_meter_file_name text default '',closing_meter_file_name text default '');`);
    await db.query(`INSERT INTO maintenance_requests(id,reference,verified_at,opening_meter_file,opening_meter_file_name,complaint_audio) VALUES (1,'OLD','2026-09-30T18:29:59Z',$1,'Original card.png',$2),(2,'OCTOBER','2026-09-30T18:30:00Z',$1,'oct.png',$2),(3,'UNVERIFIED',NULL,$1,'pending.png',$2)`,[png,audio]);
    assert.equal((await previewMediaBackup(pool,'2026-10-01')).requests,1);
    const file=path.join(root,'backup.zip');
    assert.deepEqual(await exportMediaBackup(pool,'2026-10-01',createWriteStream(file)),{files:2,requests:1});
    const manifest=await scanMediaZip(file);assert.equal(manifest.entries.length,2);assert.equal(manifest.entries[0].name,'Original card.png');
    const damaged=path.join(root,'damaged.zip'),zip=new yazl.ZipFile();
    const written=pipeline(zip.outputStream,createWriteStream(damaged));
    for(const entry of manifest.entries)zip.addBuffer(Buffer.from('tampered'),entry.path);
    zip.addBuffer(Buffer.from(JSON.stringify(manifest)),'manifest.json');zip.end();await written;
    await assert.rejects(scanMediaZip(damaged),/checksum/);
    assert.deepEqual(await restoreMediaBackup(pool,file),{restored:0,unchanged:2});
    await db.exec(`UPDATE maintenance_requests SET opening_meter_file='',complaint_audio='' WHERE id=1`);
    assert.deepEqual(await restoreMediaBackup(pool,file),{restored:2,unchanged:0});
    assert.equal((await db.query('SELECT opening_meter_file FROM maintenance_requests WHERE id=1')).rows[0].opening_meter_file,png);
    await db.query(`UPDATE maintenance_requests SET opening_meter_file='',complaint_audio=$1 WHERE id=1`,['data:audio/webm;base64,Y29uZmxpY3Q=']);
    await assert.rejects(restoreMediaBackup(pool,file),/different media/);
    assert.equal((await db.query('SELECT opening_meter_file FROM maintenance_requests WHERE id=1')).rows[0].opening_meter_file,'');
    await db.query(`UPDATE maintenance_requests SET complaint_audio='',verified_at='2026-10-02' WHERE id=1`);
    await assert.rejects(restoreMediaBackup(pool,file),/verification changed/);
    await writeFile(path.join(root,'bad.zip'),'not a ZIP');await assert.rejects(scanMediaZip(path.join(root,'bad.zip')));
    assert.equal((await db.query("SELECT count(*)::int AS count FROM maintenance_requests WHERE id IN (2,3) AND opening_meter_file<>'' AND complaint_audio<>''")).rows[0].count,2);
  }finally{await db.close();await rm(root,{recursive:true,force:true});}
});
