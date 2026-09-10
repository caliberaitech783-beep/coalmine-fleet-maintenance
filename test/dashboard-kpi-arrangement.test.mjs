import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {requestEventDate} from "../src/dashboard-request-data.mjs";

const client = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/dashboard-concept-a.css", import.meta.url), "utf8");

test("removed KPI strip no longer leaves arrangement controls", () => {
  assert.doesNotMatch(client, /nerveCenterDashboardKpiOrder/);
  assert.doesNotMatch(client, /Arrange KPIs/);
  assert.doesNotMatch(client, /draggable: editingKpiLayout/);
  assert.doesNotMatch(client, /className="mine-primary-kpi-grid"/);
});

test("request lifecycle counts each workflow timestamp separately", () => {
  assert.match(client, /import \{[^}]*requestEventDate[^}]*\} from "\.\/dashboard-request-data\.mjs"/);
  const record = {start: "2026-09-05 09:00:00", closedAt: "2026-09-07 09:00:00", verifiedAt: "2026-09-08T19:00:00Z", idealRequestedAt: "2026-09-06 10:00:00"};
  assert.equal(requestEventDate(record, "opened"), "2026-09-05");
  assert.equal(requestEventDate(record, "idle"), "2026-09-06");
  assert.equal(requestEventDate(record, "closed"), "2026-09-07");
  assert.equal(requestEventDate(record, "verified"), "2026-09-09");
  assert.equal(requestEventDate({start: record.start}, "idle"), "");
  assert.match(client, /requestLifecycleRows\.opened/);
  assert.match(client, /requestLifecycleRows\.closed/);
  assert.match(client, /requestLifecycleRows\.verified/);
  assert.match(client, /requestLifecycleRows\.idle/);
  assert.match(client, /opened: locationBreakdowns\.filter\(\(record\) => String\(record\.status \|\| ""\)\.trim\(\)\.toLowerCase\(\) !== "closed"/);
  assert.match(client, /closed: locationBreakdowns\.filter\(\(record\) => String\(record\.status \|\| ""\)\.trim\(\)\.toLowerCase\(\) === "closed"/);
  assert.match(client, /key: "production", className: "opened", label: "Production Request", note: "Production \+ Maintenance", value: requestLifecycleRows\.production\.length/);
  assert.match(client, /lifecycleRecords=\{assetDrilldown\.startsWith\("event:"\)\}/);
  assert.match(css, /\.mine-request-lifecycle-chart/);
});

test("request lifecycle shows maintenance and MIS availability cards", () => {
  assert.match(client, /maintenance: requestLifecycleRows\.opened\.length/);
  assert.match(client, /mis: maintenanceClosedRows\.length/);
  assert.match(client, /label: "Open in Maint", note: "Active in Maintenance"/);
  assert.match(client, /label: "Open in MIS", note: "Closed - Verified"/);
  assert.match(css, /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
});
