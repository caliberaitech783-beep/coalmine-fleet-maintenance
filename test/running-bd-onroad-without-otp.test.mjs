import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {deletionOperation,protectDeletionPool,resetProductionFirstTripAcceptance} from '../deletion-approval.mjs';

test('Running BD on-road closure is not classified as an OTP deletion',()=>{
  assert.equal(deletionOperation('patch','/api/requests/:reference/close'),false);
  assert.equal(deletionOperation('delete','/api/requests/:reference'),true);
  assert.equal(deletionOperation('post','/api/requests/bulk-delete'),true);
});

test('first-trip reset is restricted to the same request acceptance row',async()=>{
  const calls=[];
  const rawPool={query:async(sql,values)=>{calls.push({sql,values});return {rows:/^SELECT 1 FROM/i.test(sql)?[{found:1}]:[],rowCount:1};}};
  const pool=protectDeletionPool(rawPool);
  await resetProductionFirstTripAcceptance(pool,' REQ-123 ');
  assert.deepEqual(calls,[{
    sql:'DELETE FROM production_first_trip_acceptances WHERE request_reference=$1',
    values:['REQ-123'],
  }]);
  await assert.rejects(pool.query('DELETE FROM production_first_trip_acceptances WHERE request_reference=$1',['REQ-OTHER']),/WhatsApp OTP approval/);
  await assert.rejects(pool.query('DELETE FROM maintenance_requests WHERE reference=$1',['REQ-123']),/WhatsApp OTP approval/);
  assert.throws(()=>resetProductionFirstTripAcceptance(pool,'  '),/request reference/i);
});

test('close handler uses the narrow reset and contains no OTP requirement',()=>{
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const close=server.slice(server.indexOf("app.patch('/api/requests/:reference/close'"),server.indexOf("app.patch('/api/requests/:reference/ideal-onroad'"));
  assert.match(close,/await resetProductionFirstTripAcceptance\(client,reference\)/);
  assert.doesNotMatch(close,/approve its removal by WhatsApp OTP/);
  assert.doesNotMatch(close,/DELETE FROM production_first_trip_acceptances/);
});
