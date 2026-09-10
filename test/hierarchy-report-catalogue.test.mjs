import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HIERARCHY_REPORT_GROUPS,HIERARCHY_REPORT_TITLES,HIERARCHY_REPORT_CODES,hierarchyReportEquivalent,normalizeHierarchyReportAccess,hierarchyAccessAllowsReport} from '../hierarchy-report-catalogue.mjs';
import {DEPARTMENT_REPORT_TITLES} from '../department-reports.mjs';
import {DIRECTOR_REPORT_TITLES} from '../director-report-bundle.mjs';
import {IN_OUT_REPORT_TITLE} from '../in-out-report.mjs';

test('hierarchy report groups carry the Reports menu headings in menu order',()=>{
  assert.deepEqual(HIERARCHY_REPORT_GROUPS.map(group=>[group.group,group.viewKey]),[['General Report','C'],['Production Report','P'],['Maintenance Report','M'],['MIS Report','S']]);
  const byGroup=Object.fromEntries(HIERARCHY_REPORT_GROUPS.map(group=>[group.viewKey,group.reports]));
  assert.deepEqual(byGroup.C,['Report for On Road / Off Road & Idle','Vehicle Transfer Report','Total Equipment / Vehicle Location Wise','Recent Breakdown Cases',IN_OUT_REPORT_TITLE,'Summary Report']);
  assert.deepEqual(byGroup.P,['Total Request Submitted Report','Ticket Acceptance from Maintenance (Timelinewise)','Maintenance Status Pending']);
  assert.deepEqual(byGroup.M,['Turn Around Time for Repair','Open Off road Cases','Availability Report','Vehicle Arrival Red Flag Report']);
  assert.deepEqual(byGroup.S,['30 Min. Mismatch','Unverified Cases','MIS Turn Around Time','Total Fleet','Total In and out count report','MIS Red Flag Report']);
  assert.equal(new Set(HIERARCHY_REPORT_TITLES).size,HIERARCHY_REPORT_TITLES.length,'each heading is ticked once');
  for(const title of DEPARTMENT_REPORT_TITLES)assert.ok(HIERARCHY_REPORT_TITLES.includes(title),`${title} is selectable in the hierarchy master`);
  for(const title of [...byGroup.P,...byGroup.M,...byGroup.S,'Summary Report'])assert.ok(DEPARTMENT_REPORT_TITLES.includes(title),`${title} still exists in the department report list`);
  for(const group of HIERARCHY_REPORT_GROUPS) {
    const prefix={C:'G',P:'P',M:'M',S:'MS '}[group.viewKey];
    assert.deepEqual(group.reports.map(title=>HIERARCHY_REPORT_CODES.get(title)),group.reports.map((_,index)=>`${prefix}${index+1}`));
  }
  for(const title of HIERARCHY_REPORT_TITLES)assert.ok(DIRECTOR_REPORT_TITLES.includes(title),`${title} can be built for WhatsApp delivery`);
});

test('older hierarchy ticks and scheduled titles map onto their catalogue equivalent',()=>{
  assert.equal(hierarchyReportEquivalent('Location wise opened BD'),'Total Request Submitted Report');
  assert.equal(hierarchyReportEquivalent('Location wise Open BD report with Category (Prod)'),'Total Request Submitted Report');
  assert.equal(hierarchyReportEquivalent('Location wise closing BD'),'Turn Around Time for Repair');
  assert.equal(hierarchyReportEquivalent('On Road with first trip veri.'),'30 Min. Mismatch');
  assert.equal(hierarchyReportEquivalent('Availability Report'),'Availability Report');
  assert.equal(normalizeHierarchyReportAccess('Location wise opened BD | Off Road to Maint. Close | Location wise closing BD | Availability Report'),'Total Request Submitted Report | Turn Around Time for Repair | Availability Report');
  assert.equal(hierarchyAccessAllowsReport('Total Request Submitted Report | Availability Report','Location wise opened BD'),true);
  assert.equal(hierarchyAccessAllowsReport('Availability Report','Location wise opened BD'),false);
  assert.equal(hierarchyAccessAllowsReport('Location wise closing BD','Turn Around Time for Repair'),true,'an unsaved older tick still admits the catalogue report');
});

test('the hierarchy master and server use the shared catalogue',()=>{
  const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  assert.match(source,/from "\.\.\/hierarchy-report-catalogue\.mjs"/);
  assert.match(source,/const hierarchyReportGroups = HIERARCHY_REPORT_GROUPS;/);
  assert.match(source,/const hierarchyReportCodes = HIERARCHY_REPORT_CODES;/);
  assert.match(server,/hierarchyAccessAllowsReport\(hierarchyRule\.reportAccess,title\)/);
});
