import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {REQUEST_HISTORY_MEDIA_FIELDS,requestHistorySnapshotSql,requestHistoryTimelineSql} from '../request-history-payload.mjs';
import {retryDatabaseRead} from '../database-read-retry.mjs';
import {measureRequestHistoryPayload} from '../request-history-diagnostics.mjs';

test('history stays on demand and legacy media never enters timeline responses',async()=>{
  const db=new PGlite();
  try {
    const media='data:audio/webm;base64,'+'A'.repeat(1024*1024);
    const visit={status:'Running BD',maintenance_work:'Hydraulic repair',time:'2026-10-06T07:00:00Z',verified_at:'2026-10-06T07:10:00Z',verified_by:'MIS',complaint_audio:media,maintenance_audio:media,complaint_media:[{data:media}]};
    await db.exec(`CREATE TABLE maintenance_requests(reference text,status text,maintenance_work text,workflow_history jsonb,complaint_audio text,maintenance_audio text,complaint_media jsonb,first_trip_card_image text,opening_meter_file text,closing_meter_file text,archived_at timestamptz)`);
    await db.query('INSERT INTO maintenance_requests VALUES ($1,$2,$3,$4,$5,$5,$6,$5,$5,$5,NULL)', ['REQ-1','Running BD','Hydraulic repair',JSON.stringify([visit]),media,JSON.stringify([{data:media}])]);
    let released=false;
    const measured=await measureRequestHistoryPayload({connect:async()=>({query:(...args)=>db.query(...args),release:()=>{released=true;}})});
    assert.equal(measured.requests,1);
    assert.equal(measured.historyRequests,1);
    assert.ok(Number(measured.historyBytesRemovedFromFeed)>3*1024*1024);
    assert.equal(released,true);
    const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
    const projection=source.match(/const requestProjection=`([^`]+)`/)[1];
    assert.doesNotMatch(projection,/workflow_history|workflowHistory/);
    const {rows}=await db.query(`SELECT ${requestHistoryTimelineSql} AS history,${requestHistorySnapshotSql} AS snapshot FROM maintenance_requests`);
    for(const field of REQUEST_HISTORY_MEDIA_FIELDS){
      assert.equal(field in rows[0].history[0],false);
      assert.equal(field in rows[0].snapshot,false);
    }
    assert.equal(rows[0].history[0].maintenance_work,visit.maintenance_work);
    assert.equal(rows[0].history[0].verified_at,visit.verified_at);
    assert.equal(rows[0].history[0].time,visit.time);
    assert.ok(JSON.stringify(rows[0]).length<1000);
    // Original evidence and historical snapshots remain intact in the database.
    const saved=(await db.query('SELECT workflow_history,complaint_audio FROM maintenance_requests')).rows[0];
    assert.deepEqual(saved.workflow_history,[visit]);
    assert.equal(saved.complaint_audio,media);
    await db.exec(`UPDATE maintenance_requests SET workflow_history=workflow_history || jsonb_build_array(${requestHistorySnapshotSql} || jsonb_build_object('time',NOW()))`);
    const visits=(await db.query(`SELECT ${requestHistoryTimelineSql} AS history FROM maintenance_requests`)).rows[0].history;
    assert.equal(visits.length,2);
    assert.equal(visits[0].time,visit.time);
    assert.equal(visits[1].status,'Running BD');
    await db.exec(`UPDATE maintenance_requests SET workflow_history='[]'`);
    assert.deepEqual((await db.query(`SELECT ${requestHistoryTimelineSql} AS history FROM maintenance_requests`)).rows[0].history,[]);
  } finally {await db.close();}
});

test('notification reads recover once from an aborted PostgreSQL deadlock',async()=>{
  let attempts=0;
  const rows=await retryDatabaseRead(async()=>{if(++attempts===1)throw Object.assign(new Error('deadlock'),{code:'40P01'});return ['notification'];});
  assert.deepEqual(rows,['notification']);
  assert.equal(attempts,2);
  attempts=0;
  await assert.rejects(retryDatabaseRead(async()=>{attempts++;throw Object.assign(new Error('deadlock'),{code:'40P01'});}),/deadlock/);
  assert.equal(attempts,2);
  attempts=0;
  await assert.rejects(retryDatabaseRead(async()=>{attempts++;throw new Error('connection failed');}),/connection failed/);
  assert.equal(attempts,1);
});
