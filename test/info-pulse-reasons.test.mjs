import assert from 'node:assert/strict';
import test from 'node:test';
import {pulseCaseReasons, pulseDailyUpdates, pulseSeverityCounts} from '../src/info-pulse-reasons.mjs';

test('the overdue reason is the most recent recorded daily delay reason, not the complaint', () => {
  const row = {request: {complaint: 'Engine overheats', dailyRemarks: [
    {createdAt: '2026-09-07 10:00', remark: 'Inspection', delayReason: 'Waiting for inspection'},
    {createdAt: '2026-09-09 10:00', remark: 'New note without reason'},
    {createdAt: '2026-09-08 10:00', remark: 'Parts ordered', delayReason: 'Radiator unavailable'},
  ]}, issues: [{type: 'etc-overdue'}]};
  const result = pulseCaseReasons(row);
  assert.equal(result.primary.label, 'Overdue reason');
  assert.equal(result.primary.value, 'Radiator unavailable');
  assert.equal(result.primary.at, '2026-09-08 10:00');
  assert.deepEqual(result.updates.map(update => update.createdAt), ['2026-09-09 10:00', '2026-09-08 10:00', '2026-09-07 10:00']);
  assert.equal(result.updates.length, 3);
});

test('idle reasons and missing overdue reasons are explicit without inventing a cause', () => {
  const idle = pulseCaseReasons({request: {idleReason: 'No work', complaint: 'Tyre issue'}, issues: [{type: 'idle-vehicle'}]});
  assert.equal(idle.primary.value, 'No work');
  const overdue = pulseCaseReasons({request: {complaint: 'Engine failure'}, issues: [{type: 'etc-overdue'}]});
  assert.equal(overdue.primary.value, 'Not recorded');
  assert.equal(overdue.primary.missing, true);
  assert.equal(overdue.reasons.find(reason => reason.key === 'complaint').value, 'Engine failure');
});

test('all stored reason types are preserved along with legacy or malformed update handling', () => {
  const result = pulseCaseReasons({request: {idleReason: 'No driver', delayedReason: 'Waiting for spares', arrivalFlagRemark: 'Tow vehicle delayed', misFlagRemark: 'First trip pending', maintenanceWork: 'Valve changed'}, issues: []});
  for (const key of ['idle', 'closure', 'arrival', 'mis', 'work']) assert.ok(result.reasons.some(reason => reason.key === key));
  assert.deepEqual(pulseDailyUpdates('Legacy maintenance note').map(update => update.remark), ['Legacy maintenance note']);
  assert.deepEqual(pulseDailyUpdates([null, {}, {remark: {invalid: true}}]), []);
});

test('priority totals classify each case once even when its alerts overlap', () => {
  const rows = [{issues: [{severity: 'critical'}, {severity: 'critical'}, {severity: 'warning'}]}, {issues: [{severity: 'warning'}, {severity: 'info'}]}, {issues: [{severity: 'info'}]}];
  assert.deepEqual(pulseSeverityCounts(rows), {all: 3, critical: 1, warning: 1, info: 1});
});
