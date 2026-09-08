import test from 'node:test';
import assert from 'node:assert/strict';
import {reportTime12} from '../report-time-format.mjs';
test('report times use AM/PM and retain seconds, dates and Indian timezone',()=>{
  assert.equal(reportTime12('2026-09-07 00:12:57'),'2026-09-07 12:12:57 AM');
  assert.equal(reportTime12('2026-09-07 12:00'),'2026-09-07 12:00 PM');
  assert.equal(reportTime12('2026-09-07 22:32:43'),'2026-09-07 10:32:43 PM');
  assert.equal(reportTime12('2026-09-07T20:00:00Z'),'2026-09-08 1:30:00 AM');
  for(const value of ['2026-09-07','9h 15m','2026-09-07 10:32:43 PM','Not accepted','complaint 22:32',100]) assert.equal(reportTime12(value),value);
});
