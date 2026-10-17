import test from 'node:test';
import assert from 'node:assert/strict';
import {repairPercentageRows,percentageColumns} from '../repair-percentage-report.mjs';
import {buildDepartmentReports} from '../department-reports.mjs';
test('percentage counts every status, normalizes category and includes missing category',()=>{
  const rows=repairPercentageRows([{category:' Engine ',status:'Open'},{category:'engine',status:'Closed'}, {category:'Electrical',status:'In progress'}, {category:''}]);
  assert.deepEqual(rows.map(row=>row.count),[2,1,1]);
  assert.equal(rows[0].percentage,50);
  assert.equal(rows.reduce((sum,row)=>sum+row.percentage,0),100);
  assert.ok(rows.some(row=>row.repairCategory==='Not specified'));
  assert.ok(rows.every(row=>row.total===4));
});
test('empty and archived cases are safe',()=>{
  assert.deepEqual(repairPercentageRows([]),[]);
  assert.deepEqual(repairPercentageRows([{category:'Engine',archivedAt:'2026-10-01'}]),[]);
});
test('report aggregates after filtering, exports same values without per-request meter columns',()=>{
  const report=buildDepartmentReports({requests:[{category:'Engine',site:'Sasti OC',start:'2026-10-17',status:'Closed'},{category:'Electrical',site:'Majri OC',status:'Open'}]}).find(row=>row.title==='Percentage Report');
  assert.equal(report.category,'maintenance');
  assert.equal(report.rows.length,2);
  assert.equal(report.dateValue(report.rows[0]),'2026-10-17');
  const summary=report.aggregateRows(report.rows.filter(row=>row.site==='Sasti OC'));
  assert.equal(summary[0].percentage,100);
  assert.equal(summary[0].total,1);
  assert.deepEqual(report.columns,percentageColumns);
  assert.equal(report.columns.at(-1).value(summary[0]),'100.00%');
});
