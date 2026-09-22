import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildDepartmentReports, DEPARTMENT_REPORT_TITLES} from '../department-reports.mjs';
import {stageTimingRow, stageGapLabel, slowestStageGap, slowestStageLabel, stageTimingSteps, STAGE_TIMING_GAPS} from '../stage-timing-report.mjs';
import {isDurationColumn} from '../src/duration-sort.mjs';

const STAGE_TIMING_REPORT = 'Request Stage Timing';

// One request that went through every stage, with the longest wait between the
// On Road entry and Production's first-trip confirmation.
const completed = {
  ref:'BD-1', site:'Sasti OB', door:'D1', status:'Closed', complaint:'Hose burst', equipmentGroup:'Dumper',
  start:'2026-09-20 08:00:00', requesterName:'Ramesh (Production)',
  acceptedAt:'2026-09-20 09:30:00', acceptedBy:'Maintenance User 1',
  closedAt:'2026-09-20 18:00:00', closedBy:'Maintenance User 2',
  productionFirstTripAt:'2026-09-21 06:00:00', productionFirstTripBy:'Production User 3',
  firstTripAt:'2026-09-21 07:00:00', firstTripBy:'MIS User 4',
  verifiedAt:'2026-09-21 09:00:00', verifiedBy:'MIS User 4',
};
const stageReport = (requests) => buildDepartmentReports({requests, from:'2026-09-01', to:'2026-09-30', now:new Date('2026-09-22T06:30:00Z')})
  .find((report) => report.title === STAGE_TIMING_REPORT);
const cell = (report, row, key) => report.columns.find((column) => column.key === key).value(row);

test('the report lists every stage in order with the wait before it', () => {
  const report = stageReport([completed]);
  assert.equal(report.category, 'general');
  assert.ok(DEPARTMENT_REPORT_TITLES.includes(STAGE_TIMING_REPORT));
  assert.deepEqual(report.columns.filter((column) => column.gap).map((column) => column.key), [
    'raisedToAccepted','acceptedToOnRoad','onRoadToProductionTrip','productionTripToMisTrip','misTripToVerified',
    'onRoadToMisTrip','onRoadToVerified','raisedToVerified',
  ]);
  const row = report.rows[0];
  assert.equal(cell(report, row, 'raisedAt'), '2026-09-20 08:00:00');
  assert.equal(cell(report, row, 'raisedToAccepted'), '1h 30m');
  assert.equal(cell(report, row, 'acceptedToOnRoad'), '8h 30m');
  assert.equal(cell(report, row, 'onRoadToProductionTrip'), '12h 0m');
  assert.equal(cell(report, row, 'productionTripToMisTrip'), '1h 0m');
  assert.equal(cell(report, row, 'misTripToVerified'), '2h 0m');
  assert.equal(cell(report, row, 'onRoadToVerified'), '15h 0m');
  assert.equal(cell(report, row, 'raisedToVerified'), '1d 1h 0m');
  assert.equal(cell(report, row, 'slowestStage'), 'On Road → Production first trip · 12h 0m');
  assert.equal(cell(report, row, 'acceptedBy'), 'Maintenance User 1');
  assert.ok(report.columns.length <= 24, 'exports refuse a report wider than 24 columns');
});

test('every wait column sorts by real elapsed time, not as text', () => {
  for (const column of stageReport([completed]).columns.filter((column) => column.gap)) {
    assert.ok(isDurationColumn(column.label, column.key), `${column.key} sorts as a duration`);
  }
});

test('a stage that has not happened reads Pending, and is never counted as zero', () => {
  const waiting = {...completed, closedAt:'', closedBy:'', productionFirstTripAt:'', firstTripAt:'', verifiedAt:'', status:'In progress'};
  const report = stageReport([waiting]);
  const row = report.rows[0];
  assert.equal(cell(report, row, 'acceptedToOnRoad'), 'Pending');
  assert.equal(cell(report, row, 'onRoadToProductionTrip'), 'Not recorded', 'a wait with no start time is not pending, it is unrecorded');
  assert.equal(cell(report, row, 'closedBy'), 'Pending');
  assert.equal(cell(report, row, 'slowestStage'), 'Raised → Accepted · 1h 30m');
});

test('a total never wins the slowest stage, because it contains the steps', () => {
  const stages = stageTimingRow(completed);
  assert.equal(slowestStageGap(stages).gap.key, 'onRoadToProductionTrip');
  assert.equal(stageGapLabel(stages, STAGE_TIMING_GAPS[0]), '1h 30m');
});

test('a request with no Production first trip falls back to the On Road to MIS first trip wait', () => {
  const older = {...completed, productionFirstTripAt:'', productionFirstTripBy:''};
  const stages = stageTimingRow(older);
  assert.equal(slowestStageGap(stages).gap.key, 'onRoadToMisTrip');
  assert.equal(slowestStageLabel(stages), 'On Road → MIS first trip · 13h 0m');
});

test('a reversed pair of timestamps is reported as missing rather than as a negative wait', () => {
  const reversed = stageTimingRow({...completed, acceptedAt:'2026-09-19 08:00:00'});
  assert.equal(stageGapLabel(reversed, STAGE_TIMING_GAPS[0]), 'Pending');
  assert.equal(slowestStageGap(reversed).gap.key, 'acceptedToOnRoad', 'the remaining waits are still measured');
});

test('the step-by-step detail numbers each stage and marks the slowest wait once', () => {
  const steps = stageTimingSteps(completed);
  assert.deepEqual(steps.map((step) => step.label), [
    'Off Road raised','Maintenance accepted','On Road / work done','First trip confirmed by Production','First trip confirmed by MIS','MIS verified',
  ]);
  assert.deepEqual(steps.map((step) => step.step), [1,2,3,4,5,6]);
  assert.equal(steps.filter((step) => step.slowest).length, 1);
  assert.equal(steps.find((step) => step.slowest).label, 'First trip confirmed by Production');
  assert.equal(steps[1].gap, '1h 30m');
  assert.equal(steps[1].actor, 'Maintenance User 1');
});

test('the table marks the slowest wait while exports keep the plain duration', () => {
  const client = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(client, /function withStageGapHighlights\(columns\)/);
  assert.match(client, /columns=\{withTimelineLinks\(withStageGapHighlights\(selectedReport\.columns\), session\?\.token \|\| authToken\)\}/);
  assert.match(client, /className=\{`stage-gap\$\{highlighted \? " slowest" : ""\}`\}/);
  const styles = readFileSync(new URL('../src/reports-workspace.css', import.meta.url), 'utf8');
  assert.match(styles, /\.stage-gap\.slowest \{/);
});
