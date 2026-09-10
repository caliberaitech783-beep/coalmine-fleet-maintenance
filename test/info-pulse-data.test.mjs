import assert from 'node:assert/strict';
import test from 'node:test';
import {aiFeederAlerts, parseIstTimestamp} from '../ai-feeder.mjs';
import {buildInfoPulseCases, infoPulseColumns, infoPulseDate, infoPulseSiteOptions, infoPulseView} from '../info-pulse-data.mjs';
import {infoPulseRequestScope, scopeInfoPulseRequests} from '../info-pulse-scope.mjs';

const NOW = Date.parse('2026-09-10T12:00:00+05:30');
const base = {status: 'Open', site: 'Sasti OB', start: '2026-09-01 12:00', expectedCompletionAt: '2026-09-08 12:00'};
const build = rows => buildInfoPulseCases(rows, {role: 'Admin', now: NOW});

test('site totals reconcile to unique requests and every issue drill-down beyond sixty', () => {
  const records = Array.from({length: 147}, (_, i) => ({...base, ref: `R-${i}`, door: `D-${i}`, site: i % 3 === 0 ? 'MAJRI II' : i % 2 ? 'SASTI II' : 'Sasti OB'}));
  const cases = build([...records, records[10]]);
  const view = infoPulseView(cases);
  assert.equal(cases.length, 147);
  assert.equal(view.totals.total, 147);
  assert.equal(view.sites.reduce((sum, site) => sum + site.total, 0), 147);
  assert.equal(view.sites.length, 2);
  assert.equal(view.totals.counts['etc-overdue'], 147);
  assert.equal(view.totals.counts['long-running'], 147);
  assert.equal(view.totals.counts['stale-update'], 147);
  for (const site of [...view.sites, view.totals]) {
    assert.equal(infoPulseView(cases, {site: site.key}).rows.length, site.total);
    for (const [type, count] of Object.entries(site.counts)) {
      const rows = infoPulseView(cases, {site: site.key, type}).rows;
      assert.equal(rows.length, count);
      assert.equal(new Set(rows.map(row => row.key)).size, count);
    }
  }
});

test('date filters use inclusive IST request dates, including zoned timestamps', () => {
  const cases = build([
    {...base, ref: 'before', start: '2026-09-01T18:29:59Z'},
    {...base, ref: 'start', start: '2026-09-01T18:30:00Z'},
    {...base, ref: 'end', start: '2026-09-02 23:59:59'},
    {...base, ref: 'after', start: '2026-09-03 00:00:00'},
    {...base, ref: 'missing', start: ''},
  ]);
  assert.equal(cases.length, 5);
  const view = infoPulseView(cases, {from: '2026-09-02', to: '2026-09-02'});
  assert.deepEqual(view.rows.map(row => row.key).sort(), ['end', 'start']);
  assert.equal(view.totals.total, 2);
  assert.equal(infoPulseView(cases, {from: '2026-09-03'}).totals.total, 1);
  assert.equal(infoPulseView(cases, {to: '2026-09-01'}).totals.total, 1);
  assert.equal(infoPulseView(cases, {from: '2026-09-03', to: '2026-09-01'}).invalidRange, true);
  assert.equal(infoPulseDate('2026-09-01T18:30:00Z'), '2026-09-02');
  assert.ok(Number.isNaN(parseIstTimestamp('2026-02-30 12:00')));
  assert.ok(Number.isNaN(parseIstTimestamp('2026-02-30T12:00:00Z')));
});

test('verified, closed, idle and future requests are classified correctly', () => {
  const records = [
    {...base, ref: 'verified-date', verifiedAt: '2026-09-09 12:00'},
    {...base, ref: 'verified-status', verificationStatus: 'Verified'},
    {...base, ref: 'closed', status: 'Closed', closedAt: '2026-09-09 12:00'},
    {...base, ref: 'idle', status: 'Idle'},
    {...base, ref: 'future', start: '2026-09-11 12:00'},
  ];
  const cases = build(records);
  assert.equal(cases.length, 2);
  assert.deepEqual(cases.find(row => row.key === 'closed').issues.map(issue => issue.type), ['awaiting-verification']);
  assert.deepEqual(cases.find(row => row.key === 'idle').issues.map(issue => issue.type), ['idle-vehicle']);
});

test('newest duplicate projection wins and separate requests for one door stay separate', () => {
  const updated = {...base, ref: 'R1', updatedAt: '2026-09-10T07:00:00Z', verifiedAt: '2026-09-10 11:00'};
  const stale = {...base, ref: 'R1', updatedAt: '2026-09-10T06:00:00Z'};
  assert.equal(build([updated, stale]).length, 0);
  assert.equal(build([stale, updated]).length, 0);
  assert.equal(build([{...base, ref: 'R2', door: 'D1'}, {...base, ref: 'R3', door: 'D1'}]).length, 2);
  assert.equal(build([stale, stale, {...base}, {...base}]).length, 3);
});

test('site aliases, zero-case assigned sites and missing site are preserved', () => {
  const records = [{...base, ref: 'A'}, {...base, ref: 'B', site: 'SASTI II'}, {...base, ref: 'C', site: ''}];
  const sites = infoPulseSiteOptions(records, ['Majri OB']);
  assert.equal(sites.length, 3);
  const view = infoPulseView(build(records), {sites});
  assert.equal(view.sites.find(site => site.key === 'majri ob').total, 0);
  assert.equal(infoPulseView(build(records), {site: 'SASTI II'}).totals.total, 2);
  assert.equal(infoPulseView(build(records), {site: 'unassigned'}).totals.total, 1);
});

test('server-permitted scope is preserved in every count and drill-down', () => {
  const scope = infoPulseRequestScope({role: 'normal', location: 'Sasti OB'}, {});
  const permitted = scopeInfoPulseRequests([{...base, ref: 'allowed'}, {...base, ref: 'denied', site: 'Majri OB'}], scope);
  const cases = buildInfoPulseCases(permitted, {role: 'MIS User', now: NOW});
  assert.deepEqual(cases.map(row => row.key), ['allowed']);
  assert.equal(infoPulseView(cases, {site: 'Majri OB'}).totals.total, 0);
  assert.ok(infoPulseColumns('MIS User').every(column => column.key !== 'stale-update'));
});

test('threshold boundaries and fresh records are counted without rounding early', () => {
  const types = request => aiFeederAlerts([request], {now: NOW}).map(issue => issue.type);
  assert.ok(types({...base, ref: 'due', expectedCompletionAt: '2026-09-10 12:00'}).includes('etc-due-soon'));
  assert.ok(!types({...base, ref: 'due', expectedCompletionAt: '2026-09-10 12:00'}).includes('etc-overdue'));
  assert.ok(!types({...base, ref: 'wait', status: 'Closed', closedAt: '2026-09-10 00:00:01'}).includes('awaiting-verification'));
  assert.ok(types({...base, ref: 'wait', status: 'Closed', closedAt: '2026-09-10 00:00:00'}).includes('awaiting-verification'));
  assert.ok(!types({...base, ref: 'days', start: '2026-09-07 12:00:01'}).includes('long-running'));
});
