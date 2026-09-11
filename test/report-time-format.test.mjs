import test from 'node:test';
import assert from 'node:assert/strict';
import {reportTime12} from '../report-time-format.mjs';
test('report times use AM/PM and retain seconds, dates and Indian timezone',()=>{
  assert.equal(reportTime12('2026-09-07 00:12:57'),'12:12:57 AM 07-09-2026');
  assert.equal(reportTime12('2026-09-07 12:00'),'12:00 PM 07-09-2026');
  assert.equal(reportTime12('2026-09-07 22:32:43'),'10:32:43 PM 07-09-2026');
  assert.equal(reportTime12('2026-09-07T20:00:00Z'),'1:30:00 AM 08-09-2026');
  assert.equal(reportTime12('2026-09-07'),'07-09-2026');
  assert.equal(reportTime12('2026-09-07 10:32:43 PM'),'10:32:43 PM 07-09-2026');
  assert.equal(reportTime12('07-09-2026 10:32:43 PM'),'10:32:43 PM 07-09-2026');
  for(const value of ['07-09-2026','10:32:43 PM 07-09-2026','9h 15m','Not accepted','complaint 22:32',100]) assert.equal(reportTime12(value),value);
});
