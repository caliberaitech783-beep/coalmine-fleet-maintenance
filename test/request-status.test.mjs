import test from 'node:test';
import assert from 'node:assert/strict';
import {requestStatusLabel} from '../src/request-status.mjs';
import {visibleInMisRequests, visibleInMisHistory} from '../src/mis-history.mjs';
import {buildDepartmentReports} from '../department-reports.mjs';
import {buildDirectorReportTables} from '../director-report-bundle.mjs';

const closed = Object.freeze({ref:'REQ-VERIFIED', status:'Closed', start:'2026-09-09 08:00:00', closedAt:'2026-09-09 10:00:00'});
const verified = Object.freeze({...closed, verifiedAt:'2026-09-09 11:00:00', verifiedBy:'MIS User'});

test('MIS verification changes the displayed status and history without reopening the maintenance lifecycle', () => {
  assert.equal(requestStatusLabel(closed), 'Closed');
  assert.equal(requestStatusLabel(verified), 'Verified');
  assert.equal(requestStatusLabel({...closed, verifiedAt:' ', verifiedBy:'Name only'}), 'Closed');
  assert.equal(visibleInMisRequests(closed), true);
  assert.equal(visibleInMisRequests(verified), false);
  assert.equal(visibleInMisHistory(verified), true);
  assert.equal(verified.status, 'Closed');
});

test('department and scheduled director reports export Verified for verified requests', () => {
  const args={requests:[closed,verified],now:new Date('2026-09-09T12:00:00+05:30')};
  for (const reports of [buildDepartmentReports(args),buildDirectorReportTables(args)]) {
    const statusColumns = reports.flatMap(report => report.columns.filter(column => column.key === 'status'));
    assert.ok(statusColumns.length);
    for (const column of statusColumns) {
      assert.equal(column.value(closed), 'Closed');
      assert.equal(column.value(verified), 'Verified');
    }
  }
});
