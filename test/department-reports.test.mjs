import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {availabilityRows,buildDepartmentReports,DEPARTMENT_REPORT_TITLES} from '../department-reports.mjs';
const now = new Date('2026-09-07T12:00:00+05:30');
const build = requests => buildDepartmentReports({requests,now,from:'2026-09-01',to:'2026-09-07'});
const cell = (report,key,row=report.rows[0]) => report.columns.find(c=>c.key===key).value(row);
test('Excel structure supplies 12 live reports, excluding pending Oracle utilization',()=>{
  const reports=build([]);
  assert.deepEqual(reports.map(r=>r.title),DEPARTMENT_REPORT_TITLES);
  assert.equal(reports.filter(r=>r.category==='maintenance').length,3);
  assert.equal(reports.filter(r=>r.category==='mis').length,6);
  assert.equal(reports.filter(r=>r.category==='production').length,3);
  assert.equal(reports.find(r=>r.title==='Vehicle Transfer Report').columns.filter(c=>/chassis/i.test(c.label)).length,1);
});
test('pending means Open and no remark ever, no duration column, and missing remark data is not treated as empty',()=>{
  const report=build([
    {ref:'yes',status:'Open',dailyRemarks:[]},
    {ref:'old',status:'Open',dailyRemarks:[{remark:'Old remark',createdAt:'2025-01-01'}]},
    {ref:'closed',status:'Closed',dailyRemarks:[]},
    {ref:'progress',status:'In progress',dailyRemarks:[]},
    {ref:'unknown',status:'Open'},
  ]).find(r=>r.title==='Maintenance Status Pending');
  assert.deepEqual(report.rows.map(r=>r.ref),['yes']);
  assert.equal(cell(report,'remark'),'No Remark');
  assert.ok(!report.columns.some(c=>/difference|elapsed/i.test(c.label)));
});
test('mismatch uses firstTripAt and strictly more than 30 minutes across all closed requests',()=>{
  const reports=build([30,31].map(minutes=>({ref:String(minutes),closedAt:'2026-09-01 12:00:00',firstTripAt:`2026-09-01 12:${minutes}:00`,status:'Closed'})));
  assert.deepEqual(reports.find(r=>r.title==='30 Minutes Mismatch').rows.map(r=>r.ref),['31']);
  assert.equal(reports.find(r=>r.title==='Unverified Cases').rows.length,2);
});
test('acceptance is not inferred from status or closure',()=>{
  const report=build([{status:'Closed',start:'2026-09-01 09:00',closedAt:'2026-09-01 10:00'}]).find(r=>r.title.includes('Acceptance'));
  assert.equal(cell(report,'acceptedAt'),'Not recorded');
  assert.equal(cell(report,'difference'),'Not recorded');
});
test('availability clips intervals to selected inclusive days and merges overlaps',()=>{
  const equipment=[{door:'A',equipmentName:'Asset A'},{door:'B'}];
  const requests=[
    {door:'A',start:'2026-08-31 23:00',closedAt:'2026-09-01 02:00'},
    {door:'A',start:'2026-09-01 01:00',closedAt:'2026-09-01 03:00'},
    {door:'B',start:'2026-09-03 00:00',closedAt:'2026-09-03 01:00'},
  ];
  const rows=availabilityRows(equipment,requests,'2026-09-01','2026-09-02',now);
  assert.equal(rows[0].productive,44);
  assert.equal(rows[0].breakdown,3);
  assert.equal(rows[0].available,41);
  assert.equal(rows[0].percentage,41/44*100);
  assert.equal(rows[1].breakdown,0);
  assert.deepEqual(availabilityRows(equipment,requests,'bad','bad',now),[]);
});
test('acceptance capture is additive, atomic and preserves first transition; report source includes remarks',()=>{
  const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  assert.match(source,/ADD COLUMN IF NOT EXISTS in_progress_at TIMESTAMPTZ/);
  assert.match(source,/status<>'In progress' AND \$3='In progress' THEN COALESCE\(in_progress_at,NOW\(\)\)/);
  assert.match(source,/requests:await attachDailyRemarks\(requestRows\)/);
});
