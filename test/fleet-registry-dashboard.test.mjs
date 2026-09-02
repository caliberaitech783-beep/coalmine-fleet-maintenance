import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/dashboard-concept-a.css", import.meta.url), "utf8");

test("fleet registry dashboard connects category, group, region and site-wise drilldowns", () => {
  assert.match(source, /className="mine-panel mine-fleet-command mine-span-2"/);
  assert.match(source, /Total equipment intelligence/);
  assert.match(source, /aria-label="Equipment and vehicle bifurcation"/);
  assert.match(source, /fleetGroupInsights\.map/);
  assert.match(source, /fleetRegionInsights\.map/);
  assert.match(source, /region\.sites\.map/);
  assert.match(source, /openAssetDrilldown\(`site:\$\{site\.name\}`\)/);
  assert.match(source, /key\.startsWith\("site:"\)/);
  assert.match(css, /\.mine-fleet-command-body\s*\{[\s\S]*grid-template-columns:/);
  assert.match(css, /\.mine-fleet-site-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,/);
});

test("breakdown trend is compact, responsive and site selectable", () => {
  assert.match(source, /<div className="mine-trend-sites"/);
  assert.doesNotMatch(source, /<aside className="mine-trend-sites"/);
  assert.match(css, /\.mine-breakdown-trend-body\s*\{[\s\S]*grid-template-columns:/);
  assert.match(css, /\.mine-trend-period button\.active/);
  assert.match(css, /\.mine-trend-chart\s*\{[\s\S]*overflow-x:\s*auto/);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*\.mine-breakdown-trend-body\s*\{\s*grid-template-columns:\s*1fr/);
});
