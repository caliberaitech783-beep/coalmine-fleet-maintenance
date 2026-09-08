import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDepartmentReports} from '../department-reports.mjs';
import {buildDirectorReportTables,buildXlsxWorkbookBuffer} from '../director-report-bundle.mjs';
import {buildTableExportPdf} from '../table-export-pdf.mjs';

const now=new Date('2026-09-08T18:00:00+05:30');
const base={equipment:'TEST-DOOR',door:'TEST-DOOR',chassis:'TEST-CHASSIS',site:'Sasti OB',start:'2026-09-01 08:00',category:'Breakdown',equipmentGroup:'EXCAVATOR',owner:'Stupal',requesterLogin:'stupal',complaint:'Synthetic workflow audit only'};
const requests=[
  {ref:'OPEN',status:'Open'},
  {ref:'ACCEPTED',status:'In progress',acceptedAt:'2026-09-01 08:30'},
  {ref:'PARTS',status:'Awaiting parts',acceptedAt:'2026-09-01 08:30'},
  {ref:'IDLE',status:'Idle',acceptedAt:'2026-09-01 08:30',idealRequestedAt:'2026-09-02 10:00',idleReason:'No work'},
  {ref:'CANCEL-IDLE',status:'In progress',acceptedAt:'2026-09-01 08:30',idealRequestedAt:null,idleReason:''},
  {ref:'CLOSED',status:'Closed',acceptedAt:'2026-09-01 08:30',closedAt:'2026-09-02 10:00',closedBy:'Sanskar Manohare'},
  {ref:'MANAGER-APPROVED',status:'Closed',acceptedAt:'2026-09-01 08:30',closedAt:'2026-09-03 10:00',closedBy:'MAIMaintenance Manager',idealRequestedAt:'2026-09-02 10:00',idealApprovedAt:'2026-09-03 10:00',idleReason:'No work'},
  {ref:'VERIFIED',status:'Closed',acceptedAt:'2026-09-01 08:30',closedAt:'2026-09-02 10:00',closedBy:'Sanskar Manohare',firstTripAt:'2026-09-02 10:45',verifiedAt:'2026-09-02 11:00',verifiedBy:'Damini Rai',arrivalFlaggedAt:'2026-09-01 08:20',arrivalFlagRemark:'Recovery vehicle required',misFlaggedAt:'2026-09-02 10:15',misFlagRemark:'Meter evidence checked'},
].map(row=>Object.freeze({...base,...row}));
const equipment=[{equipmentName:base.equipment,door:base.door,chassisNo:base.chassis,currentLocation:base.site,category:'Equipment'}];

test('every lifecycle phase appears in the appropriate reports regardless of employee names',()=>{
  const reports=buildDepartmentReports({requests,equipmentRecords:equipment,now,from:'2026-09-01',to:'2026-09-08'});
  const refs=title=>reports.find(report=>report.title===title).rows.map(row=>row.ref);
  for(const title of ['Open Off road Cases','Maintenance Status Pending'])assert.deepEqual(refs(title),['OPEN','ACCEPTED','PARTS','CANCEL-IDLE']);
  assert.deepEqual(refs('Unverified Cases'),['CLOSED','MANAGER-APPROVED']);
  assert.deepEqual(refs('Time Taken for MIS Verification'),['VERIFIED']);
  assert.deepEqual(refs('Summary Report'),['VERIFIED']);
  assert.deepEqual(refs('Vehicle Arrival Red Flag Report'),['VERIFIED']);
  assert.deepEqual(refs('MIS Red Flag Report'),['VERIFIED']);
  assert.deepEqual(refs('Total Request Submitted Report'),requests.map(row=>row.ref));
  for(const report of reports)for(const row of report.rows)for(const column of report.columns){
    assert.notEqual(String(column.value(row)),'NaN',`${report.title}: ${column.key}`);
    assert.notEqual(String(column.value(row)),'Invalid Date',`${report.title}: ${column.key}`);
  }
});

test('all 28 report definitions produce PDF and safe Excel exports within the route column limit',async()=>{
  const tables=buildDirectorReportTables({requests,equipmentRecords:equipment,now});
  assert.equal(tables.length,28);
  for(const table of tables){
    assert.ok(table.columns.length>0 && table.columns.length<=24,`${table.title}: ${table.columns.length} columns`);
    assert.ok(table.rows.every(row=>row.length===table.columns.length),`${table.title}: inconsistent row width`);
    const pdf=await buildTableExportPdf({title:table.title,columns:table.columns,rows:table.rows});
    assert.equal(pdf.subarray(0,5).toString(),'%PDF-',table.title);
    const workbook=buildXlsxWorkbookBuffer(table.title,table.columns,table.rows);
    assert.equal(workbook.subarray(0,2).toString(),'PK',table.title);
    assert.match(workbook.toString('utf8'),/t="inlineStr"/);
  }
});
