import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {resolveRequestIssues,hasOutstandingRequestIssues} from '../request-workflow.mjs';

// Execute the production statement in PostgreSQL, including its parameter type
// inference. A mocked query cannot catch the timestamp CASE regression.
const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const statement=server.match(/`(UPDATE maintenance_requests SET issues=\$1::jsonb,running_bd_at=[^`]+)`/)[1]
  .replace('${requestProjection}','*');

test('PostgreSQL saves Running BD handoffs and final closure with outstanding issue history',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`CREATE TABLE maintenance_requests (
      reference text PRIMARY KEY, status text, issues jsonb DEFAULT '[]',
      running_bd_at timestamptz, closed_at timestamptz, verified_at timestamptz,
      verified_by text, verification_status text, first_trip_at timestamptz,
      first_trip_done boolean, first_trip_by text, first_trip_card_image text
    ); INSERT INTO maintenance_requests(reference,status) VALUES ('REQ-DB','Running BD');`);
    const issues=[{reason:'Parts unavailable',resolved:false},{reason:'Hydraulic leak',resolved:false}];
    const handoff='2026-10-05T11:24:08.000Z';
    let result=await db.query(statement,[JSON.stringify(issues),handoff,'REQ-DB']);
    assert.equal(result.rows[0].running_bd_at.toISOString(),handoff);
    assert.equal(result.rows[0].closed_at,null);
    assert.equal(result.rows[0].status,'Running BD');
    assert.equal(result.rows[0].issues.length,2);
    // MIS and first-trip completion leave the ticket open. A later maintenance
    // handoff must clear those prior downstream acknowledgements.
    await db.exec(`UPDATE maintenance_requests SET verified_at=NOW(),verified_by='MIS',
      verification_status='Verified',first_trip_at=NOW(),first_trip_done=true,
      first_trip_by='Production',first_trip_card_image='previous-card'`);
    const partial=resolveRequestIssues({issues},[0]);
    assert.equal(hasOutstandingRequestIssues(partial),true);
    result=await db.query(statement,[JSON.stringify(partial),new Date('2026-10-06T11:24:08Z'),'REQ-DB']);
    assert.equal(result.rows[0].status,'Running BD');
    assert.equal(result.rows[0].issues[0].resolved,true);
    assert.equal(result.rows[0].issues[1].resolved,false);
    assert.equal(result.rows[0].verified_at,null);
    assert.equal(result.rows[0].first_trip_at,null);
    assert.equal(result.rows[0].first_trip_done,false);
    assert.equal(result.rows[0].first_trip_card_image,'');
    const resolved=resolveRequestIssues({issues:partial},[1]);
    assert.equal(hasOutstandingRequestIssues(resolved),false);
    await db.query("UPDATE maintenance_requests SET status='Closed',closed_at=$1 WHERE reference=$2",['2026-10-07T11:24:08Z','REQ-DB']);
    result=await db.query(statement,[JSON.stringify(resolved),'2026-10-07T11:24:08Z','REQ-DB']);
    assert.equal(result.rows[0].status,'Closed');
    assert.equal(result.rows[0].running_bd_at,null);
    assert.ok(result.rows[0].closed_at);
    assert.ok(result.rows[0].issues.every(issue=>issue.resolved));
  }finally{await db.close();}
});
