import test from 'node:test';
import assert from 'node:assert/strict';
import {downtimeMatrixExport,downtimePdfHeading} from '../src/downtime-matrix-export.mjs';
import {reportPdfHeading} from '../report-refinements.mjs';
import {sameReportView} from '../src/report-portal-target.mjs';
const columns=[{key:'door'},{key:'equipmentGroup'},{key:'start'}];
const rows=[{door:'EX01',equipmentGroup:'EXCAVATOR'}];
const context={site:'Dhoptala OC (2nd)',date:'2026-10-17'};
test('selected date/time range appears in exports with and without a group filter',()=>{
  const rangeLabel='10-10-26 08:00:00 AM to 11-10-26 06:00:00 PM IST';
  for (const filters of [{},{equipmentGroup:'EXCAVATOR'}]) {
    const result=downtimeMatrixExport({columns,rows,filters},{site:context.site,rangeLabel});
    assert.ok(result.title.endsWith(rangeLabel));
    assert.equal(result.title.split(context.site).length-1,1);
  }
});
test('PDF heading keeps the selected site exactly once',()=>{
  const view=downtimeMatrixExport({columns,rows,filters:{equipmentGroup:'EXCAVATOR'}},context);
  const result=downtimePdfHeading(view.title,[{site:context.site}],view.columns,reportPdfHeading);
  assert.equal(result,view.title);
  assert.equal(result.split(context.site).length-1,1);
  assert.equal(downtimePdfHeading('Other Report',[{site:context.site}],[],reportPdfHeading),'Other Report - Dhoptala OC (2nd)');
});
test('filtered export names group and selected day and omits redundant column',()=>{
  const result=downtimeMatrixExport({columns,rows,filters:{equipmentGroup:'EXCAVATOR'}},context);
  assert.equal(result.title,'Downtime Matrix Report - Dhoptala OC (2nd) - EXCAVATOR - 17-10-2026');
  assert.deepEqual(result.columns.map(c=>c.key),['door','start']);
  assert.equal(result.rows,rows);
  assert.equal(columns.length,3);
});
test('unfiltered export retains equipment group even when only one group exists',()=>{
  const result=downtimeMatrixExport({columns,rows,filters:{}},context);
  assert.equal(result.title,'Downtime Matrix Report - Dhoptala OC (2nd)');
  assert.equal(result.columns,columns);
});
test('filter removal updates export even if the resulting rows do not change',()=>{
  const view={sourceRows:rows,rows,columns,filters:{equipmentGroup:'EXCAVATOR'}};
  assert.equal(sameReportView(view,{...view,filters:{}}),false);
  assert.equal(sameReportView(view,{...view}),true);
});
