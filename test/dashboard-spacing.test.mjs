import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync(new URL("../src/dashboard-spacing.css", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("dashboard spacing overrides load after readability without changing dashboard data", () => {
  assert.ok(source.indexOf('import "./dashboard-spacing.css"') > source.indexOf('import "./dashboard-readability.css"'));
  assert.match(css, /\.mine-dashboard \.mine-fleet-chart-heading \{ display: flex; flex-wrap: wrap; align-items: center/);
  assert.match(css, /\.mine-dashboard \.mine-fleet-chart-toggle button \{[^}]*white-space: nowrap/);
  assert.match(css, /@media \(max-width: 700px\)/);
});

test("dashboard top bars stay stacked and print banner remains in document flow", () => {
  assert.match(css, /\.content:has\(\.mine-dashboard\) > \.top \{ position: sticky; z-index: 40/);
  assert.match(css, /top: var\(--dashboard-banner-top, var\(--dashboard-sticky-top, 0px\)\); z-index: 30/);
  assert.match(css, /@media print \{\s*\.mine-dashboard > \.dashboard-filter-bar \{ position: static/);
});
