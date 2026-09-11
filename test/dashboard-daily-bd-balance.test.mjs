import assert from 'node:assert/strict';
import test from 'node:test';
import {buildDailyBdBalance, dailyBdRecordsForMetric, bdBalanceChange, DAILY_BD_METRICS} from '../src/daily-bd-balance.mjs';

const request = (ref, start, closedAt = '', extra = {}) => ({ref, start, closedAt, status: closedAt ? 'Closed' : 'Open', ...extra});
const refs = rows => rows.map(row => row.ref).sort();

test('screenshot ledger reconciles to 75: every daily closing is the next opening, including the underlying requests', () => {
  const incoming = [74, 44, 65, 83, 109, 136, 99], outgoing = [45, 47, 67, 70, 117, 117, 84];
  const records = Array.from({length: 12}, (_, i) => request(`OLD-${i}`, '2026-09-01 09:00'));
  for (let day = 0; day < 7; day++) {
    const date = `2026-09-${String(day + 5).padStart(2, '0')}`;
    for (let i = 0; i < incoming[day]; i++) records.push(request(`${day}-${i}`, `${date} 09:00`));
    records.filter(row => !row.closedAt).slice(0, outgoing[day]).forEach(row => {row.status = 'Closed'; row.closedAt = `${date} 18:00`;});
  }
  const {days, totals, excluded} = buildDailyBdBalance(records, '2026-09-05', '2026-09-11');
  assert.deepEqual(days.map(row => row.open), [12, 41, 38, 36, 49, 41, 60]);
  assert.deepEqual(days.map(row => row.balance), [41, 38, 36, 49, 41, 60, 75]);
  assert.deepEqual([totals.open, totals.incoming, totals.outgoing, totals.balance, totals.delta, totals.percent], [12, 610, 547, 75, 63, 525]);
  assert.equal(excluded.length, 0);
  for (const [i, day] of days.entries()) {
    for (const {key} of DAILY_BD_METRICS) assert.equal(dailyBdRecordsForMetric(records, day.date, day.date, key).length, day[key]);
    if (i > 0) assert.deepEqual(refs(dailyBdRecordsForMetric(records, days[i - 1].date, days[i - 1].date, 'balance')), refs(dailyBdRecordsForMetric(records, day.date, day.date, 'open')));
  }
});

test('12 + 100 − 100 = 12; next day 12 + 100 − 98 = 14, carried into the next opening', () => {
  const records = [
    ...Array.from({length: 12}, (_, i) => request(`OLD-${i}`, '2025-01-01 10:00')),
    ...Array.from({length: 100}, (_, i) => request(`DAY1-${i}`, '2026-09-09 09:00', '2026-09-09 18:00')),
    ...Array.from({length: 100}, (_, i) => request(`DAY2-${i}`, '2026-09-10 09:00', i < 98 ? '2026-09-10 18:00' : '')),
  ];
  const {days, totals, excluded} = buildDailyBdBalance(records, '2026-09-09', '2026-09-11');
  assert.deepEqual(days.map(({open, incoming, outgoing, balance}) => [open, incoming, outgoing, balance]), [[12, 100, 100, 12], [12, 100, 98, 14], [14, 0, 0, 14]]);
  assert.equal(days[1].percent.toFixed(1), '16.7');
  assert.equal(days[1].direction, 'increase');
  assert.equal(excluded.length, 0);
  assert.deepEqual([totals.open, totals.incoming, totals.outgoing, totals.balance], [12, 200, 198, 14]);
  for (const {key} of DAILY_BD_METRICS) {
    assert.equal(dailyBdRecordsForMetric(records, '2026-09-09', '2026-09-11', key).length, totals[key]);
    for (const day of days) assert.equal(dailyBdRecordsForMetric(records, day.date, day.date, key).length, day[key]);
  }
});

test('Indian midnight boundaries use start and maintenance closure, independent of MIS verification', () => {
  const records = [
    request('OLD', '2026-09-07 10:00', '2026-09-08T18:30:00Z', {verifiedAt: '2026-09-10 18:00'}),
    request('MIDNIGHT', '2026-09-08T18:30:00Z', '2026-09-09T18:29:59Z'),
    request('AFTER', '2026-09-09T18:30:00Z'),
    request('ALREADY-CLOSED', '2026-09-07 10:00', '2026-09-08T18:29:59Z'),
  ];
  const {days} = buildDailyBdBalance(records, '2026-09-09', '2026-09-10');
  assert.deepEqual(days.map(({open, incoming, outgoing, balance}) => [open, incoming, outgoing, balance]), [[1, 1, 2, 0], [0, 1, 0, 1]]);
  assert.deepEqual(refs(dailyBdRecordsForMetric(records, '2026-09-09', '2026-09-09', 'outgoing')), ['MIDNIGHT', 'OLD']);
  assert.equal(days[0].percent, -100);
  assert.equal(days[0].direction, 'decrease');
});

test('deduplicate request references using latest update, while counting separate requests for the same machine', () => {
  const records = [
    request('A', '2026-09-01', '', {updatedAt: '2026-09-01', door: 'V1'}),
    request('A', '2026-09-01', '2026-09-02', {updatedAt: '2026-09-03', door: 'V1'}),
    request('A', '2026-09-01', '', {updatedAt: '2026-09-02', door: 'V1'}),
    request('B', '2026-09-03', '', {door: 'V1'}),
  ];
  const {totals} = buildDailyBdBalance(records, '2026-09-01', '2026-09-03');
  assert.deepEqual([totals.open, totals.incoming, totals.outgoing, totals.balance], [0, 2, 1, 1]);
  assert.deepEqual(refs(dailyBdRecordsForMetric(records, '2026-09-01', '2026-09-03', 'balance')), ['B']);
});

test('unknown or reversed dates are disclosed and inspectable, with no invented closing date', () => {
  const records = [
    request('VALID', '2026-09-01'),
    request('NO-START', ''),
    request('NO-CLOSE', '2026-09-01', '', {status: 'Closed'}),
    request('BAD-CLOSE', '2026-09-01', 'invalid'),
    request('BACKWARDS', '2026-09-01 12:00', '2026-09-01 11:00'),
    request('FALLBACK', '', '', {startedAt: '2026-09-01 10:00', completedAt: '2026-09-02 11:00'}),
  ];
  const {totals, excluded} = buildDailyBdBalance(records, '2026-09-01', '2026-09-03');
  assert.deepEqual([totals.open, totals.incoming, totals.outgoing, totals.balance], [0, 2, 1, 1]);
  assert.deepEqual(refs(excluded), ['BACKWARDS', 'BAD-CLOSE', 'NO-CLOSE', 'NO-START']);
  assert.deepEqual(dailyBdRecordsForMetric(records, '', '', 'undated'), excluded);
});

test('zero baselines have no fictitious percentage and empty dates retain zero balances', () => {
  assert.deepEqual(bdBalanceChange(0, 0), {delta: 0, percent: 0, direction: 'steady'});
  assert.deepEqual(bdBalanceChange(0, 3), {delta: 3, percent: null, direction: 'increase'});
  assert.deepEqual(bdBalanceChange(4, 3), {delta: -1, percent: -25, direction: 'decrease'});
  assert.equal(buildDailyBdBalance([], '2026-09-01', '2026-09-07').days.length, 7);
  for (const [from, to] of [['bad', '2026-09-01'], ['2026-09-02', '2026-09-01'], ['2026-02-30', '2026-03-03']]) {
    assert.equal(buildDailyBdBalance([], from, to).totals, null);
    assert.deepEqual(dailyBdRecordsForMetric([], from, to, 'open'), []);
  }
});
