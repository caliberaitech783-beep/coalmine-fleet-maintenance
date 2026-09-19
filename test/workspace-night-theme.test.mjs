import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const css = readFileSync(new URL("../src/workspace-night.css", import.meta.url), "utf8");
const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
test("workspace Night overrides follow brand styles and precede chart styles", () => {
  assert.ok(main.indexOf('import "./workspace-night.css"') > main.indexOf('import "./brand-theme.css"'));
  assert.ok(main.indexOf('import "./workspace-night.css"') < main.indexOf('import "./dashboard-night.css"'));
  assert.match(css, /@media screen/);
  assert.equal((css.match(/^}/gm) || []).length, 1);
});
test("manager and shared controls have Night surfaces", () => {
  for (const selector of [".manager-kpi-grid > button", ".manager-kpi-tooltip", ".manager-role-tabs", ".manager-queue-tabs", ".mobile-tabs", ".table-search-toolbar", ".searchable-select-menu", ".request-timeline-stages article", ".export-menu-popover", "input[readonly]", ":focus-visible"]) assert.ok(css.includes(selector), selector);
});
test("Night text palette exceeds 4.5:1 contrast on shared surfaces", () => {
  const lum = hex => { const rgb = hex.match(/\w\w/g).map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4); return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722; };
  for (const fg of ["f6f0f7", "c4b8ca", "d6b7ff"]) for (const bg of ["241d27", "302637", "1c1722"]) assert.ok((lum(fg) + .05) / (lum(bg) + .05) >= 4.5);
});
test("standalone pages, date filters and frozen tables do not retain white Night surfaces", () => {
  for (const selector of [".ticket-page-head", ".ticket-toolbar", ".ticket-table-wrap",
    ".record-date-range > label", ".reports-page > header", ".hierarchy-matrix", ".org-panel",
    ".report-schedule-fields", ".backup-overview-kpis", ".help-training-dialog",
    ".saved-report-dialog", ".wrs-dialog", ".remote-assistance-dialog",
    ".pulse-filter-panel", ".notification-list", "table tbody td"]) assert.ok(css.includes(selector), selector);
  assert.match(css, /\.ticket-page-head \.export-menu-trigger span \{ color: inherit;/);
  assert.match(css, /table tbody td \{ background: var\(--panel\); color: var\(--ink\)/);
});
