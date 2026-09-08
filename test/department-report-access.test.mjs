import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {reportCategoryIdsForUser} from "../report-access.mjs";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("all users receive General Reports plus every report for their department", () => {
  for (const [department, assignedRole] of [["production","Production User"],["maintenance","Maintenance User"],["mis","MIS User"]]) {
    assert.deepEqual(reportCategoryIdsForUser({}, {role:"normal",assignedRole}), ["general",department]);
  }
  assert.deepEqual(reportCategoryIdsForUser({adminLevel:"Super Admin"}, {role:"super"}), ["general","production","maintenance","mis"]);
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
  assert.match(reportsPage, /<PersonalReportSchedulesButton session=\{session\} \/>/);
  assert.match(reportsPage, /<Download \/> Download reports ZIP/);
  assert.doesNotMatch(reportsPage, /canUseReportWorkspaceTools/);
});

test("every user can choose from their own accessible reports without editing a designation", () => {
  const personal = fs.readFileSync(new URL("../src/personal-report-schedules.jsx", import.meta.url), "utf8");
  assert.match(personal, /details\.allowedReports\.map/);
  assert.match(personal, /Choose my reports/);
  assert.match(personal, /checked=\{schedule\.reports\.includes\(title\)\} onChange/);
  assert.doesNotMatch(personal, /canManageAll|recipientLogins|Assign schedule to|readOnly/);
});
