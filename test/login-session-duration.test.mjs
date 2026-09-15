import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionTimeSummary,formatSessionDuration} from '../src/login-session-duration.mjs';
const from='2026-09-14T12:00:00Z',to='2026-09-15T12:00:00Z';
const session=(createdAt,lastSeenAt)=>({createdAt,lastSeenAt});
test('durations clip to the 24-hour window and merge overlapping devices without double counting',()=>{
  const result=sessionTimeSummary([
    session('2026-09-14T11:00:00Z','2026-09-14T13:00:00Z'),
    session('2026-09-14T12:30:00Z','2026-09-14T14:00:00Z'),
    session('2026-09-14T12:45:00Z','2026-09-14T13:00:00Z'),
    session('2026-09-15T11:00:00Z','2026-09-15T13:00:00Z'),
  ],from,to);
  assert.deepEqual(result.durations,[3600000,5400000,900000,3600000]);
  assert.equal(result.total,10800000);
  assert.equal(formatSessionDuration(result.total),'3h 0m 0s');
});
test('invalid or reversed timestamps do not invent time and an empty history totals zero',()=>{
  const result=sessionTimeSummary([session('bad',to),session(to,from),session(from,from)],from,to);
  assert.deepEqual(result.durations,[null,null,0]);
  assert.equal(result.total,0);
  assert.equal(sessionTimeSummary([],from,to).total,0);
  assert.equal(formatSessionDuration(null),'Not recorded');
  assert.equal(formatSessionDuration(3661000),'1h 1m 1s');
});
