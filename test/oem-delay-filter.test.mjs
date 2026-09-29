import test from 'node:test';
import assert from 'node:assert/strict';
import {filterOemDelayedRows} from '../src/oem-delay-filter.mjs';
import {buildOemBreakdownRows} from '../src/oem-breakdown-model.mjs';
test('live OEM list includes old open cases but excludes completed and idle cases', () => {
  const requests = ['Accepted', 'In progress', 'Closed', 'Verified', 'Idle'].map((status, index) => ({ref: String(index), door: `V${index}`, site: 'Sasti OC', status, start: '2026-08-01 09:00:00', delayedReason: 'Manpower OEM'}));
  const rows = filterOemDelayedRows(buildOemBreakdownRows({requests}));
  assert.deepEqual(rows.flatMap(row => row.requests.map(request => request.status)).sort(), ['Accepted', 'In progress']);
});
test('OEM cases require an OEM delayed reason, not an OEM make or complaint', () => {
  const rows = ['Parts OEM', 'Tools - OEM', 'Manpower OEM', 'Parts CMLL', ''].map(delayedReason => ({requests: [{delayedReason, complaint: 'OEM', make: 'OEM'}]}));
  assert.equal(filterOemDelayedRows(rows).length, 3);
  assert.equal(filterOemDelayedRows([{requests: [{dailyRemarks: [{delayReason: 'Tools OEM', createdAt: '2026-09-29 10:00:00'}]}]}]).length, 1);
});
