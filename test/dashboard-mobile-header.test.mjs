import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("dashboard filters use a dedicated responsive grid without overlapping the heading", () => {
  const dashboard = readFileSync(new URL("../src/dashboard-concept-a.css", import.meta.url), "utf8");
  const filters = readFileSync(new URL("../src/dashboard-filter-bar.css", import.meta.url), "utf8");

  assert.match(dashboard, /\.mine-dashboard-head>div:first-child[^}]*\.mine-head-actions label\{min-width:0\}/);
  assert.match(filters, /@media \(max-width: 1180px\), \(hover: none\) and \(pointer: coarse\) \{[\s\S]*\.mine-dashboard > \.dashboard-filter-bar > div:first-child \{ flex-basis: 100%; \}/);
  assert.match(filters, /@media \(max-width: 1180px\), \(hover: none\) and \(pointer: coarse\) \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(filters, /@media \(max-width: 480px\) \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
});
