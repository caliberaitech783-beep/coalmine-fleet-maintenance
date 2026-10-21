import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {requestMediaStorage} from '../request-media-storage.mjs';

test('media accounting separates formats and IST periods and reconciles the existing counter without changing data',async()=>{
  const db=new PGlite();
  const pool={connect:async()=>({query:(sql,args)=>db.query(sql,args),release(){}})};
  try{
    await db.exec(`CREATE TABLE maintenance_requests(id int primary key,verified_at timestamptz,opening_meter_file text default '',closing_meter_file text default '',first_trip_card_image text default '',complaint_audio text default '',maintenance_audio text default '',complaint_media jsonb default '[]');`);
    const image='data:image/webp;base64,aGVsbG8=',video='data:video/webm;base64,dmlkZW8=',audio='data:audio/ogg;base64,YXVkaW8=',pdf='data:application/pdf;base64,cGRm';
    const attachments=JSON.stringify([{name:'photo.webp',data:image},{name:'clip.webm',data:video}]);
    await db.query(`INSERT INTO maintenance_requests(id,verified_at,opening_meter_file,first_trip_card_image,complaint_audio,complaint_media) VALUES (1,'2026-09-30T18:29:59Z',$1,$1,$2,$3::jsonb)`,[image,audio,attachments]);
    await db.query(`INSERT INTO maintenance_requests(id,verified_at,closing_meter_file,maintenance_audio) VALUES (2,'2026-09-30T18:30:00Z',$1,$2),(3,'2026-10-31T18:29:59Z',$1,$2),(4,NULL,$1,$2),(5,'2026-10-31T18:30:00Z',$1,$2)`,[pdf,audio]);
    const before=JSON.stringify((await db.query('SELECT * FROM maintenance_requests ORDER BY id')).rows);
    const report=await requestMediaStorage(pool);
    const old=report.periods.find(row=>row.key==='beforeOctober'),oct=report.periods.find(row=>row.key==='october'),pending=report.periods.find(row=>row.key==='unverified'),after=report.periods.find(row=>row.key==='afterOctober');
    assert.equal(old.types.images.files,3);assert.equal(old.types.images.bytes,3*Buffer.byteLength(image));
    assert.equal(old.types.videos.bytes,Buffer.byteLength(video));assert.equal(old.types.audio.bytes,Buffer.byteLength(audio));
    assert.equal(old.additionalTripCardBytes,Buffer.byteLength(image));
    assert.equal(oct.requests,2);assert.equal(oct.types.pdfs.files,2);assert.equal(oct.types.audio.files,2);
    assert.equal(pending.requests,1);assert.equal(after.requests,1);
    assert.equal(report.totals.totalBytes+report.totals.counterJsonOverheadBytes,report.totals.counterBytes+report.totals.additionalTripCardBytes);
    assert.equal(JSON.stringify((await db.query('SELECT * FROM maintenance_requests ORDER BY id')).rows),before);
  }finally{await db.close();}
});
