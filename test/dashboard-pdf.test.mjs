import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {downloadDashboardPdf} from "../src/dashboard-pdf.mjs";

test("dashboard PDF reports an unavailable dashboard without downloading", async () => {
  await assert.rejects(downloadDashboardPdf(null, "dashboard.pdf"), /Dashboard is not available/);
});

test("both KPI exports opt into visual PDF without changing ordinary table exports", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.equal((source.match(/label="Export KPIs" dashboardPdf/g) || []).length, 2);
  assert.match(source, /dashboardPdf = false/);
  assert.match(source, /if \(dashboardPdf\) \{[\s\S]*?downloadDashboardPdf[\s\S]*?return;\s*\}/);
  assert.match(source, /fetch\("\/api\/exports\/pdf"/);
});
