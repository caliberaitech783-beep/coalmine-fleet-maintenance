import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/dashboard-concept-a.css", import.meta.url), "utf8");

test("all dashboard families expose Print, PDF, and Excel for their scoped KPI data", () => {
  assert.match(source, /const dashboardKpiExportColumns = \[/);
  assert.match(source, /const managerDashboardExportRows = \[/);
  assert.match(source, /const dashboardExportRows = \[/);
  assert.match(source, /title=\{`\$\{title\} dashboard KPI report`\}/);
  assert.match(source, /title="Fleet control dashboard KPI report"/);
  assert.equal((source.match(/label="Export KPIs"/g) || []).length, 2);
  assert.match(source, /Download as PDF/);
  assert.match(source, /Download as Excel/);
  assert.match(source, /<Printer \/> Print/);
  assert.match(styles, /\.mine-head-actions \.dashboard-export-trigger/);
});

test("fleet KPI exports retain active scope, period, movement, type and road availability data", () => {
  assert.match(source, /const dashboardScopeLabel = dashboardSite !== "all"/);
  assert.match(source, /section: "Breakdown movement"/);
  assert.match(source, /section: "Breakdown type"/);
  assert.match(source, /section: "Site summary"/);
  assert.match(source, /Availability \$\{road\.availability\}%/);
  assert.match(source, /section: "Request lifecycle"/);
});
