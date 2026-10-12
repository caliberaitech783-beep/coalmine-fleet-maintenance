import test from 'node:test';
import assert from 'node:assert/strict';
import {reportEquipmentGroupOptions,matchesReportEquipmentGroup,UNCLASSIFIED_REPORT_GROUP} from '../src/report-equipment-group.mjs';
import {buildDepartmentReports,TOTAL_SUMMARY_REPORT_TITLE} from '../department-reports.mjs';
test('equipment-group options normalize whitespace and case without merging different groups',()=>{
 assert.deepEqual(reportEquipmentGroupOptions([{equipmentGroup:' dozers '},{group:'DOZERS'},{equipmentGroup:'  dump   trucks '},{equipmentGroup:'DOZER'},{}]).map(x=>x.label),['DOZER','DOZERS','DUMP TRUCKS','Unclassified']);
 assert.equal(matchesReportEquipmentGroup({equipmentGroup:' dozers '},'DOZERS'),true);
 assert.equal(matchesReportEquipmentGroup({equipmentGroup:'DOZER'},'DOZERS'),false);
 assert.equal(matchesReportEquipmentGroup({},UNCLASSIFIED_REPORT_GROUP),true);
 assert.equal(matchesReportEquipmentGroup({},''),true);
});
test('total-summary filtering keeps both open and verified requests for the selected group',()=>{
 const requests=[{ref:'OPEN',status:'Open',equipmentGroup:'DOZERS',start:'2026-10-12 10:00:00'},{ref:'VERIFIED',status:'Closed',equipmentGroup:' dozers ',start:'2026-10-12 09:00:00',verifiedAt:'2026-10-12 12:00:00'},{ref:'OTHER',status:'Open',equipmentGroup:'EXCAVATORS',start:'2026-10-12 11:00:00'}];
 const report=buildDepartmentReports({requests}).find(r=>r.title===TOTAL_SUMMARY_REPORT_TITLE);
 assert.deepEqual(report.rows.filter(row=>matchesReportEquipmentGroup(row,'DOZERS')).map(r=>r.ref),['OPEN','VERIFIED']);
 assert.equal(report.rows.filter(row=>matchesReportEquipmentGroup(row,'')).length,3);
 assert.equal(report.rows.filter(row=>matchesReportEquipmentGroup(row,'NOT PRESENT')).length,0);
});