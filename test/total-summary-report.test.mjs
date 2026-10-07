import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDepartmentReports,DEPARTMENT_REPORT_TITLES} from '../department-reports.mjs';
import {HIERARCHY_REPORT_GROUPS} from '../hierarchy-report-catalogue.mjs';

test('total summary adds open cases without modifying the verified-only summary or duplicating rows',()=>{
  const requests=[
    {ref:'verified',status:'Closed',verifiedAt:'2026-10-07 12:00',closedAt:'2026-10-07 11:00'},
    {ref:'open',status:'Open'},
    {ref:'accepted',status:'In progress',acceptedAt:'2026-10-07 10:00'},
    {ref:'parts',status:'Awaiting parts'},
    {ref:'closed',status:'Closed',closedAt:'2026-10-07 11:00'},
    {ref:'idle',status:'Idle'},
  ].map(row=>({...row,start:'2026-10-07 09:00',site:'Sasti OC'}));
  const reports=buildDepartmentReports({requests});
  const summary=reports.find(r=>r.title==='Summary Report');
  const total=reports.find(r=>r.title==='Total Summary Report');
  assert.deepEqual(summary.rows.map(r=>r.ref),['verified']);
  assert.deepEqual(total.rows.map(r=>r.ref),['verified','open','accepted','parts']);
  assert.equal(total.category,'general');
  assert.deepEqual(total.columns.map(c=>[c.key,c.label]),summary.columns.map(c=>[c.key,c.label]));
  for(const row of total.rows){
    assert.equal(total.dateValue(row),'2026-10-07 09:00');
    assert.deepEqual(total.columns.map(c=>c.value(row)),summary.columns.map(c=>c.value(row)));
  }
  assert.ok(DEPARTMENT_REPORT_TITLES.includes(total.title));
  assert.ok(HIERARCHY_REPORT_GROUPS.find(g=>g.viewKey==='C').reports.includes(total.title));
});
test('total summary handles empty requests',()=>{
  assert.deepEqual(buildDepartmentReports().find(r=>r.title==='Total Summary Report').rows,[]);
});
