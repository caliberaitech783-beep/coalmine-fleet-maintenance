import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
const reportsPage = source.slice(source.indexOf("function ReportsPage("), source.indexOf("function AdminReportsPage("));

test("Reports page resolves road status as one indexed fleet snapshot", () => {
  assert.match(reportsPage, /const roadStatuses = liveEquipmentRoadStatuses\(equipmentRecords, reportRequests\)/);
  assert.match(reportsPage, /reportRoadStatus: roadStatusDisplayLabel\(roadStatuses\[index\]\)/);
  assert.doesNotMatch(reportsPage, /reportRoadStatus: roadStatusLabel\(record, reportRequests\)/);
});

test("Reports page memoizes expensive derived collections", () => {
  assert.match(reportsPage, /const fleetStatusRows = useMemo\(/);
  assert.match(reportsPage, /const departmentReports = useMemo\(\(\) => buildDepartmentReports/);
  assert.match(reportsPage, /const recentBreakdownRows = useMemo\(/);
});

test("Reports render without waiting for schedule settings", () => {
  assert.doesNotMatch(reportsPage, /Loading assigned reports/);
  assert.doesNotMatch(reportsPage, /fetch\("\/api\/report-schedule-settings"/);
  assert.match(reportsPage, /openReportSchedules[\s\S]*loadReportScheduleDetails\(scope\)/);
});
