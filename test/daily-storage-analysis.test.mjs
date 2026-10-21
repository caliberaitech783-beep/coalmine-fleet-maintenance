import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {dailyStorageAnalysis} from '../daily-storage-analysis.mjs';
test('daily inventory uses IST event dates, retains unknown dates and performs no mutations',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`CREATE TABLE maintenance_requests(created_at timestamptz,closed_at timestamptz,first_trip_at timestamptz,opening_meter_file text default '',closing_meter_file text default '',first_trip_card_image text default '',complaint_audio text default '',maintenance_audio text default '',complaint_media jsonb default '[]');CREATE TABLE published_reports(created_at timestamptz,file_data bytea);`);
    const image='data:image/webp;base64,YQ==',audio='data:audio/webm;base64,YQ==';
    await db.query(`INSERT INTO maintenance_requests(created_at,closed_at,opening_meter_file,maintenance_audio,first_trip_card_image) VALUES ('2026-10-16T18:30Z','2026-10-18T18:30Z',$1,$2,$1)`,[image,audio]);
    await db.exec(`INSERT INTO published_reports VALUES ('2026-10-16T18:29Z',decode('61','hex')),('2026-10-16T18:30Z',decode('6162','hex'));`);
    const before=JSON.stringify((await db.query('SELECT * FROM maintenance_requests')).rows);
    const result=await dailyStorageAnalysis({connect:async()=>({query:(sql,args)=>db.query(sql,args),release(){}})});
    assert.equal(result.media.find(r=>r.source==='opening').day,'2026-10-17');
    assert.equal(result.media.find(r=>r.source==='maintenanceAudio').day,'2026-10-19');
    assert.equal(result.media.find(r=>r.source==='firstTrip').day,'Unknown date');
    assert.equal(Number(result.media.find(r=>r.source==='opening').bytes),Buffer.byteLength(image));
    assert.equal(result.reports.length,1);assert.equal(result.reports[0].day,'2026-10-17');assert.equal(Number(result.reports[0].bytes),2);
    assert.equal(JSON.stringify((await db.query('SELECT * FROM maintenance_requests')).rows),before);
  }finally{await db.close();}
});
