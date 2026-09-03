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

test("manager defaults include Reports, schedules and ZIP download tools", () => {
  assert.match(source, /tabs\.add\("Reports"\)/);
  assert.match(source, /mobileTabs\.add\("Reports"\)/);
  assert.match(source, /record\.reportAccess = \[\.\.\.departmentReportLabels\]\.join/);
  assert.match(source, /canUseReportWorkspaceTools/);
  assert.match(source, /Report schedules/);
  assert.match(source, /Download reports ZIP/);
});
