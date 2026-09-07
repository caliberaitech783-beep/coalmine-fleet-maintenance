import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {buildDirectorReportTables} from '../director-report-bundle.mjs';
import {buildDepartmentReports} from '../department-reports.mjs';

const client = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const request = Object.freeze({
  ref: 'REQ-time-audit', status: 'Closed', site: 'Sasti OB',
  start: '2026-09-07 10:00:00', closedAt: '2026-09-07 11:00:00',
  verifiedAt: '2026-09-07 12:31:42', verifiedBy: 'MIS user',
  firstTripAt: '2026-09-07 11:45:17', firstTripDone: true,
});

test('MIS saves system verification time independently of first trip input, including seconds', () => {
  const route = server.slice(server.indexOf("app.patch('/api/requests/:reference/verify'"), server.indexOf("app.get('/api/requests/:reference/trip-card'"));
  assert.match(route, /verified_at=NOW\(\)/);
  assert.match(route, /first_trip_at=\$3/);
  assert.doesNotMatch(route, /req\.body\?*\.(verifiedAt|verificationTime|verifyTime)/);
  assert.match(server, /to_char\(verified_at AT TIME ZONE 'Asia\/Kolkata','YYYY-MM-DD HH24:MI:SS'\)/);
  assert.match(route, /const verifiedAt=requestNotificationTime\(`\$\{rows\[0\]\.verifiedAt/);
});

test('history displays saved first trip independently, preserves seconds and supports older date/time fields', () => {
  const firstTrip = new Function(`${client.slice(client.indexOf('function firstTripTimestamp('), client.indexOf('function roadStatusLabel('))}; return firstTripTimestamp;`)();
  const format = new Function(`${client.slice(client.indexOf('function formatTwelveHourDateTime('), client.indexOf('function dashboardRecordDate('))}; return formatTwelveHourDateTime;`)();
  assert.equal(firstTrip(request), request.firstTripAt);
  assert.equal(firstTrip({firstTripDate:'2026-09-06',firstTripTime:'23:45:10'}), '2026-09-06 23:45:10');
  assert.equal(firstTrip({verifiedAt:request.verifiedAt}), '');
  assert.equal(format(request.verifiedAt, true), '2026-09-07 12:31:42 PM');
  assert.equal(format(firstTrip(request), true), '2026-09-07 11:45:17 AM');
  assert.equal(format('2026-09-07 00:05:03', true), '2026-09-07 12:05:03 AM');
  assert.equal(format('2026-09-07 13:05', true), '2026-09-07 1:05:00 PM');
  assert.equal(format(''), '—');
});

test('department reports and all director exports retain separate verification and first trip columns', () => {
  const report = buildDepartmentReports({requests:[request]}).find(r => r.title === 'Time Taken for MIS Verification');
  const value = key => report.columns.find(c => c.key === key).value(request);
  assert.equal(value('verifiedAt'), request.verifiedAt);
  assert.equal(value('firstTripAt'), request.firstTripAt);
  assert.equal(report.dateValue(request), request.verifiedAt);
  const tables = buildDirectorReportTables({requests:[request]}).filter(table => table.columns.some(c => c.key === 'verifiedAt'));
  assert.ok(tables.length >= 4);
  for (const table of tables) {
    assert.equal(table.columns.filter(c => c.key === 'firstTripAt').length, 1, table.title);
    if (!table.rows.length) continue;
    assert.equal(table.rows[0][table.columns.findIndex(c => c.key === 'verifiedAt')], request.verifiedAt, table.title);
    assert.equal(table.rows[0][table.columns.findIndex(c => c.key === 'firstTripAt')], request.firstTripAt, table.title);
  }
  const pendingTrip = {...request,firstTripAt:'',firstTripDone:false};
  assert.equal(report.columns.find(c => c.key === 'firstTripAt').value(pendingTrip), '');
});
