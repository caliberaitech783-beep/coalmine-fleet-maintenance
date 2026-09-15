import assert from 'node:assert/strict';
import test from 'node:test';
import {buildDepartmentReports} from '../department-reports.mjs';
import {buildDirectorReportTables,DIRECTOR_REPORT_TITLES} from '../director-report-bundle.mjs';
import {locationCountLabel} from '../in-out-report.mjs';
import {managerReportScope} from '../region-scope.mjs';

const now=new Date('2026-09-15T06:00:00Z');
const request={ref:'REQ-SASTI',door:'S-1',site:'SASTI',status:'Open',start:'2026-09-15 09:00:00'};

test('standalone Sasti is exposed only as Sasti OB in report filters and exports',()=>{
  const report=buildDepartmentReports({requests:[request],now})
    .find(({title})=>title==='Total Request Submitted Report');
  const location=report.columns.find(({key})=>key==='site');
  assert.equal(location.value(report.rows[0]),'Sasti OB');

  const director=buildDirectorReportTables({requests:[request],now})
    .find(({title})=>title===DIRECTOR_REPORT_TITLES[7]);
  const locationIndex=director.columns.findIndex(({key})=>key==='site');
  assert.equal(director.rows[0][locationIndex],'Sasti OB');
  assert.doesNotMatch(director.rows.flat().join('|'),/(?:^|\|)SASTI(?:\||$)/);
});

test('standalone and canonical Sasti values collapse into one visible location',()=>{
  assert.equal(locationCountLabel([{site:'SASTI'},{site:'Sasti OB'},{site:'Sasti II'}]),'Sasti OB (3)');
  assert.equal(managerReportScope({site:'SASTI'}).label,'Sasti OB');
  assert.equal(managerReportScope({managerSites:'SASTI | Sasti OB'}).label,'Sasti OB');
});
