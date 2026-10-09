import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDepartmentReports} from '../department-reports.mjs';
import {pendingPdfRows,REMOVED_REPORT_TITLES} from '../report-pending-export.mjs';
import {HIERARCHY_REPORT_TITLES} from '../hierarchy-report-catalogue.mjs';
import {transferReportTimingColumns} from '../transfer-report-timing.mjs';
test('transfer timing uses actual submission and destination acceptance, not date-only import values',()=>{
 const tat=transferReportTimingColumns.find(c=>c.key==='transferTat');
 assert.equal(tat.value({submittedAt:'2026-10-09T01:00:00Z',destinationAcceptedAt:'2026-10-09T03:00:00Z'}),'2h 0m');
 assert.equal(tat.value({transferDate:'2026-10-09',destinationAcceptedAt:'2026-10-09T03:00:00Z'}),'Not recorded');
 assert.equal(tat.value({submittedAt:'2026-10-09T01:00:00Z'}),'Pending');
});
test('requested report schemas remove chassis and retain repair actors',()=>{
 const reports=buildDepartmentReports();
 for(const title of ['Unverified Cases','MIS Turn Around Time','30 Min. Mismatch','Vehicle Arrival Red Flag Report','Availability Report','Turn Around Time for Repair']){
  assert.ok(reports.find(r=>r.title===title));
  assert.ok(!reports.find(r=>r.title===title).columns.some(c=>c.key==='chassis'),title);
 }
 const repair=reports.find(r=>r.title==='Turn Around Time for Repair');
 assert.equal(repair.columns.find(c=>c.key==='acceptedBy').value({acceptedBy:'A'}),'A');
 assert.equal(repair.columns.find(c=>c.key==='closedBy').value({closedBy:'B'}),'B');
 assert.equal(reports.find(r=>r.title==='Ticket Acceptance from Maintenance (Timelinewise)').columns.find(c=>c.key==='difference').label,'Delayed time');
 for(const title of REMOVED_REPORT_TITLES)assert.ok(!HIERARCHY_REPORT_TITLES.includes(title));
});
test('pending PDF sorts numeric timestamps longest first and counts only supplied rows',()=>{
 const rows=[{site:'Sasti OC',acceptedAt:'2026-10-09T01:00:00Z'},{site:'Majri OC',acceptedAt:'2026-09-01T01:00:00Z'},{site:'Sasti OC'}];
 const result=pendingPdfRows('Maintenance Status Pending',rows);
 assert.deepEqual(result.rows,[rows[1],rows[0],rows[2]]);
 assert.deepEqual(result.summary.rows,[['Majri OC',1],['Sasti OC',2]]);
 assert.equal(rows[0].site,'Sasti OC');
 assert.deepEqual(pendingPdfRows('Unverified Cases',[{site:'Sasti OC',closedAt:'2026-10-01'}, {site:'Sasti OC',closedAt:'2026-09-01'}]).rows.map(r=>r.closedAt),['2026-09-01','2026-10-01']);
 assert.equal(pendingPdfRows('Summary Report',rows).rows,rows);
});
