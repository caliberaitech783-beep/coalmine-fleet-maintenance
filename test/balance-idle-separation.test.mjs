import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDailyBdBalance, dailyBdRecordsForMetric} from '../src/daily-bd-balance.mjs';
import {matchesBreakdownMovement} from '../dashboard-breakdown-movement.mjs';

test('balance cards separate idle and ideal from active requests, including drilldowns', () => {
  const rows = ['Open', 'Accepted', 'Idle', ' ideal ', 'Closed'].map((status, id) => ({ref: String(id), status, start: '2026-09-16 08:00:00', ...(status === 'Closed' ? {closedAt: '2026-09-16 10:00:00'} : {})}));
  const from = '2026-09-16';
  const ledger = buildDailyBdBalance(rows, from, from, true);
  assert.equal(ledger.totals.balance, 2);
  assert.equal(ledger.totals.idle, 2);
  assert.equal(ledger.totals.incoming, 5);
  assert.equal(ledger.totals.outgoing, 1);
  for (const metric of ['active-balance', 'idle']) {
    assert.equal(dailyBdRecordsForMetric(rows, from, from, metric).length, 2);
    assert.equal(rows.filter(row => matchesBreakdownMovement(row, from, from, metric)).length, 2);
  }
  assert.equal(dailyBdRecordsForMetric(rows, '2026-09-15', '2026-09-15', 'idle').length, 0);
});
