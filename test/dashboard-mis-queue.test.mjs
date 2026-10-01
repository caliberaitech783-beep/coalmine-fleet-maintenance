import assert from 'node:assert/strict';
import test from 'node:test';
import { dashboardMisQueue, misQueueDate } from '../src/dashboard-mis-queue.mjs';
import { visibleInMisRequests } from '../src/mis-history.mjs';
import { requestsVisibleToDashboard } from '../mis-request-visibility.mjs';

test('pending MIS records match the workspace even when five are excluded from dashboard history', () => {
  const rows = Array.from({length: 2917}, (_, i) => ({
    ref: `REQ-${i}`, status: 'Closed', verifiedAt: '',
    site: i < 5 ? 'Dudhichua OB' : 'Majri OC',
    createdAt: '2026-09-01T10:00:00+05:30', closedAt: '2026-09-02T12:00:00+05:30',
  }));
  assert.equal(requestsVisibleToDashboard(rows).length, 2912);
  assert.deepEqual(dashboardMisQueue(rows, {from: '2026-07-01', to: '2026-10-01'}), rows.filter(visibleInMisRequests));
});

test('queue respects status, verification, site scope and inclusive Indian closing dates', () => {
  const base = {status: ' Closed ', site: 'Majri OC', closedAt: '2026-09-30T19:00:00Z'};
  const rows = [base, {...base, status: 'Accepted'}, {...base, verifiedAt: 'invalid-but-present'}, {...base, site: 'Sasti OC'}, {...base, closedAt: '2026-09-29T19:00:00Z'}];
  assert.deepEqual(dashboardMisQueue(rows, {from: '2026-10-01', to: '2026-10-01', inScope: r => r.site === 'Majri OC'}), [base]);
});

test('legacy pending requests without a closing date use their opening day in card and daily drilldown', () => {
  const row = {status: 'Closed', start: '2026-09-20T09:00:00+05:30'};
  assert.equal(misQueueDate(row), '2026-09-20');
  assert.deepEqual(dashboardMisQueue([row], {from: '2026-07-01', to: '2026-10-01'}), [row]);
});
