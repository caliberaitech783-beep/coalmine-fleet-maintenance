import test from 'node:test';
import assert from 'node:assert/strict';
import {downtimeMatrixExport} from '../src/downtime-matrix-export.mjs';
import {sameReportView} from '../src/report-portal-target.mjs';
const columns=[{key:'door'},{key:'equipmentGroup'},{key:'start'}];
const rows=[{door:'EX01',equipmentGroup:'EXCAVATOR'}];
const context={site:'Dhoptala OC (2nd)',date:'2026-10-17'};
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
