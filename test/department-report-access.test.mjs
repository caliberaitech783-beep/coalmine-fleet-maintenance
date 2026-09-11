import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("all users receive General Reports plus every report for their department", () => {
  assert.match(source, /function reportCategoryIdsForUser/);
  assert.match(source, /\["Admin", "Super Admin"\]\.includes\(adminLevel\)/);
  assert.match(source, /const categoryIds = new Set\(\["general"\]\)/);
  assert.match(source, /roleText\.includes\("production"\)[\s\S]*categoryIds\.add\("production"\)/);
  assert.match(source, /roleText\.includes\("maintenance"\)[\s\S]*categoryIds\.add\("maintenance"\)/);
  assert.match(source, /roleText\.includes\("mis"\)[\s\S]*categoryIds\.add\("mis"\)/);
  assert.match(source, /const accessibleReportGroups = reportGroups\.filter\(\(report\) => allowedReportCategoryIds\.includes\(report\.category\)\)/);
  assert.doesNotMatch(source, /hierarchyAccessibleReportGroups/);
  assert.match(source, /availableReportCategories\.map/);
  assert.match(source, /accessibleReportGroups\.filter/);
  assert.match(source, /setSection\("reports"\)[\s\S]*<FileBarChart \/> Reports/);
  assert.match(source, /section==="reports"[\s\S]*<ReportsPage[\s\S]*department: mobileRole/);
});

test("every signed-in Reports page includes schedules and ZIP download tools", () => {
  const reportsPage = source.slice(source.indexOf("function ReportsPage("), source.indexOf("function MasterPage("));
  assert.match(source, /tabs\.add\("Reports"\)/);
  assert.match(source, /mobileTabs\.add\("Reports"\)/);
  assert.match(source, /record\.reportAccess = \[\.\.\.departmentReportLabels\]\.join/);
  assert.match(reportsPage, /className="reports-header-actions"/);
  assert.match(reportsPage, /<Clock \/> Report schedules/);
  assert.match(reportsPage, /<Download \/> Download reports ZIP/);
  assert.doesNotMatch(reportsPage, /canUseReportWorkspaceTools/);
});

test("department users pick their own reports from the list the administrator assigned to the role", () => {
  const reportsPage = source.slice(source.indexOf("function ReportsPage("), source.indexOf("function MasterPage("));
  const scheduleStyles = fs.readFileSync(new URL("../src/report-schedule-polish.css", import.meta.url), "utf8");
  assert.match(reportsPage, /className="report-assignment-picker" open><summary>Reports <b>\{schedule\.reports\.length\}<\/b><\/summary>/);
  assert.match(reportsPage, /reportAccess\.allowedReports\.map\(\(title\) => <label key=\{title\}><input type="checkbox" checked=\{schedule\.reports\.includes\(title\)\}/);
  assert.doesNotMatch(reportsPage, /report-assignment-readonly/);
  assert.doesNotMatch(reportsPage, /available for this slot/);
  assert.match(reportsPage, /className="report-schedule-owner"/);
  assert.match(scheduleStyles, /\.report-schedule-owner \{/);
});
