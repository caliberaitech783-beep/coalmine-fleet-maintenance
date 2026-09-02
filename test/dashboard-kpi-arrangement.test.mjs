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
  assert.match(client, /event === "closed" \? dateKey\(record\.closedAt\) : dateKey\(record\.verifiedAt\)/);
  assert.match(client, /requestLifecycleRows\.opened/);
  assert.match(client, /requestLifecycleRows\.closed/);
  assert.match(client, /requestLifecycleRows\.verified/);
  assert.match(css, /\.mine-request-lifecycle-chart/);
});
