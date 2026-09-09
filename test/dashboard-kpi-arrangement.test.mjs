import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const client = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/dashboard-concept-a.css", import.meta.url), "utf8");

test("removed KPI strip no longer leaves arrangement controls", () => {
  assert.doesNotMatch(client, /nerveCenterDashboardKpiOrder/);
  assert.doesNotMatch(client, /Arrange KPIs/);
  assert.doesNotMatch(client, /draggable: editingKpiLayout/);
  assert.doesNotMatch(client, /className="mine-primary-kpi-grid"/);
});

test("request lifecycle counts each workflow timestamp separately", () => {
  assert.match(client, /requestEventDate = \(record, event\)/);
  assert.match(client, /dateKey\(record\.start\).*dateKey\(record\.startedAt\).*dateKey\(record\.createdAt\)/);
  assert.match(client, /event === "closed" \? dateKey\(record\.closedAt\)/);
  assert.match(client, /event === "verified" \? dateKey\(record\.verifiedAt\)/);
  assert.match(client, /requestLifecycleRows\.opened/);
  assert.match(client, /requestLifecycleRows\.closed/);
  assert.match(client, /requestLifecycleRows\.verified/);
  assert.match(client, /requestLifecycleRows\.idle/);
  assert.match(client, /openedByProduction\(record\).*requestEventDate\(record, "opened"\)/);
  assert.match(client, /label: "Opened by Production", note: "Production user requests"/);
  assert.match(client, /lifecycleRecords=\{assetDrilldown\.startsWith\("event:"\)\}/);
  assert.match(css, /\.mine-request-lifecycle-chart/);
});

test("request lifecycle shows maintenance and MIS availability cards", () => {
  // Open in Maint counts only opened requests that maintenance has not closed yet, never a net of opened minus closed.
  assert.doesNotMatch(client, /maintenance: Math\.max\(0, requestLifecycleRows\.opened\.length - requestLifecycleRows\.closed/);
  assert.match(client, /const openInMaintenanceRows = requestLifecycleRows\.opened\.filter\(\(record\) => !requestEventDate\(record, "closed"\) && String\(record\.status \|\| ""\)\.trim\(\)\.toLowerCase\(\) !== "closed"\)/);
  assert.match(client, /maintenance: openInMaintenanceRows\.length/);
  assert.match(client, /item\.key === "maintenance" \? openAssetDrilldown\("event:maintenance"\)/);
  assert.match(client, /const rows = event === "maintenance" \? openInMaintenanceRows : requestLifecycleRows\[event\] \|\| \[\]/);
  assert.match(client, /lifecycleDrilldownParts\[1\] === "maintenance" \? "Open in Maintenance requests"/);
  assert.match(client, /mis: Math\.max\(0, requestLifecycleRows\.closed\.length - requestLifecycleRows\.verified\.length\)/);
  assert.match(client, /label: "Open in Maint", note: "Opened by Production - Closed by Maintenance"/);
  assert.match(client, /label: "Open in MIS", note: "Closed by Maintenance - Verified"/);
  assert.match(css, /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
});
