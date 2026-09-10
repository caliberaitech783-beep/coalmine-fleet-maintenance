import assert from 'node:assert/strict';
import test from 'node:test';
import {parseIstTimestamp as at} from '../ai-feeder.mjs';
import {pulseElapsed, pulseCaseTiming} from '../src/info-pulse-timing.mjs';

const now = at('2026-09-10 12:00:00');
const fields = (request, types = []) => Object.fromEntries(pulseCaseTiming({request, issues: types.map(type => ({type}))}, now).map(field => [field.label, field.value ?? field.date]));
test('elapsed time retains minutes without rounding short or multi-day delays up', () => {
  assert.equal(pulseElapsed(at('2026-09-10 11:43:26'), now), '16m');
  assert.equal(pulseElapsed(at('2026-09-08 08:45:01'), now), '2d 3h 14m');
  assert.equal(pulseElapsed(now - 30000, now), 'Under 1 min');
  assert.equal(pulseElapsed(now + 1, now), 'Not recorded');
  assert.equal(pulseElapsed(NaN, now), 'Not recorded');
});
test('open cases show standing time and overdue duration using India timestamps', () => {
  const result = fields({start: '2026-09-10T05:45:00Z', status: 'Open', expectedCompletionAt: '2026-09-10 11:50:00'}, ['etc-overdue']);
  assert.equal(result['Down for'], '45m');
  assert.equal(result['ETC overdue by'], '10m');
  assert.equal(result['Standing since'], '2026-09-10T05:45:00Z');
});
test('closed cases stop breakdown time at closure and separately show pending MIS time', () => {
  const result = fields({start: '2026-09-08 10:00', status: 'Closed', closedAt: '2026-09-09 11:00', expectedCompletionAt: '2026-09-08 15:00'}, ['awaiting-verification']);
  assert.equal(result['Breakdown duration'], '1d 1h 0m');
  assert.equal(result['Waiting for MIS'], '1d 1h 0m');
  assert.ok(!('Down for' in result));
  assert.ok(!('ETC overdue by' in result));
  assert.equal(fields({start: '2026-09-08 10:00', status: 'Closed'})['Breakdown duration'], 'Not recorded');
});
test('idle vehicles continue standing after repair closure while idle time starts at closure', () => {
  const result = fields({start: '2026-09-08 10:00', status: 'Idle', closedAt: '2026-09-10 11:00'}, ['idle-vehicle']);
  assert.equal(result['Standing for'], '2d 2h 0m');
  assert.equal(result['Idle since'], '2026-09-10 11:00');
  assert.equal(result['Idle for'], '1h 0m');
  assert.ok(!('ETC overdue by' in result));
});
test('due-soon duration counts down and invalid dates never produce a zero duration', () => {
  assert.equal(fields({status: 'Open', expectedCompletionAt: '2026-09-10 12:25'}, ['etc-due-soon'])['ETC due in'], '25m');
  assert.equal(fields({start: '2026-02-30 10:00', status: 'Open'})['Down for'], 'Not recorded');
  assert.equal(fields({start: '2026-09-10 10:00', status: 'Closed', closedAt: '2026-09-09 10:00'})['Breakdown duration'], 'Not recorded');
});
