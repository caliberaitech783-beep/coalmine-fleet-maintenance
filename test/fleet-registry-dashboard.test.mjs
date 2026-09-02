import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/dashboard-concept-a.css", import.meta.url), "utf8");

test("fleet registry dashboard connects category, group, region and site-wise drilldowns", () => {
  assert.match(source, /className="mine-panel mine-fleet-command mine-span-2"/);
  assert.match(source, /Total Equipment Intelligence/);
  assert.doesNotMatch(source, /<span className="mine-eyebrow">Fleet registry<\/span>/);
  assert.doesNotMatch(source, /Category, equipment group, region and site-wise fleet distribution/);
  assert.match(source, /aria-label="Interactive asset category pie chart"/);
  assert.match(source, /aria-label="Interactive equipment groups pie chart"/);
  assert.match(source, /assetCategoryPieSlices\.map/);
  assert.match(source, /fleetGroupPieSlices\.map/);
  assert.match(source, /openAssetDrilldown\(slice\.key\)/);
  assert.match(source, /fleetRegionInsights\.map/);
  assert.match(source, /region\.sites\.map/);
  assert.match(source, /openAssetDrilldown\(`site:\$\{site\.name\}`\)/);
  assert.match(source, /key\.startsWith\("site:"\)/);
  assert.match(css, /\.mine-fleet-command-body\s*\{[\s\S]*grid-template-columns:/);
  assert.match(css, /\.mine-pie-chart\s*\{/);
  assert.match(css, /\.mine-pie-slice\s*\{[\s\S]*cursor:\s*pointer/);
  assert.match(css, /\.mine-fleet-site-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,/);
  assert.doesNotMatch(source, /className="mine-panel mine-open-cases"/);
});

test("total fleet renders a region-grouped site count graph", () => {
  assert.match(source, /aria-label="Total fleet by region and site graph"/);
  assert.match(source, /const fleetChartAxisMax =/);
  assert.match(source, /fleetChartTicks\.map/);
  assert.match(source, /fleetRegionInsights\.map\(\(region\) => <section/);
  assert.match(source, /region\.sites\.map\(\(site\) => <button/);
  assert.match(source, /site\.equipment \/ fleetChartAxisMax/);
  assert.match(source, /site\.vehicles \/ fleetChartAxisMax/);
  assert.match(source, /className="mine-fleet-site-bars"/);
  assert.match(source, /className="mine-fleet-chart-total"/);
  assert.match(css, /\.mine-fleet-region-chart\s*\{/);
  assert.match(source, /<span>Total Fleet<\/span>/);
  assert.match(css, /\.mine-fleet-chart-total\s*\{[\s\S]*justify-self:\s*center;[\s\S]*border-radius:\s*999px;[\s\S]*linear-gradient\(135deg, #e53f86, #7138b7\)[\s\S]*font:\s*900 22px/);
  assert.match(css, /\.mine-fleet-chart-regions\s*\{/);
});

test("each fleet site uses separate Caliber red equipment and purple vehicle bars with counts", () => {
  assert.match(source, /className="mine-fleet-site-bars"/);
  assert.match(source, /site\.equipment\.toLocaleString\(\)/);
  assert.match(source, /site\.vehicles\.toLocaleString\(\)/);
  assert.match(css, /\.mine-fleet-site-bars > i\.equipment\s*\{\s*background:\s*linear-gradient\([^}]*var\(--brand-red\)/);
  assert.match(css, /\.mine-fleet-site-bars > i\.vehicles\s*\{\s*background:\s*linear-gradient\([^}]*var\(--brand-purple\)/);
});

test("Total Fleet provides a persistent Caliber watermark option", () => {
  assert.match(source, /nerveCenterFleetWatermark/);
  assert.match(source, /className="mine-fleet-watermark-toggle"/);
  assert.match(source, /mine-fleet-region-chart\$\{showFleetWatermark \? " watermarked" : ""\}/);
  assert.match(css, /\.mine-fleet-region-chart\.watermarked::before[\s\S]*caliber-logo-reverse\.png[\s\S]*88% 88%/);
});

test("Total Fleet fits every site evenly across the available width", () => {
  assert.match(source, /flexGrow: Math\.max\(1, region\.sites\.length\)/);
  assert.match(css, /\.mine-fleet-chart-regions\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0/);
  assert.match(css, /\.mine-fleet-chart-sites\s*\{[^}]*grid-auto-columns:\s*minmax\(0, 1fr\);[^}]*gap:\s*0/);
});

test("breakdown trend is compact, responsive and site selectable", () => {
  assert.match(source, /<div className="mine-trend-sites"/);
  assert.doesNotMatch(source, /<aside className="mine-trend-sites"/);
  assert.match(css, /\.mine-breakdown-trend-body\s*\{[\s\S]*grid-template-columns:/);
  assert.match(css, /\.mine-trend-period button\.active/);
  assert.match(css, /\.mine-trend-chart\s*\{[\s\S]*overflow-x:\s*auto/);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*\.mine-breakdown-trend-body\s*\{\s*grid-template-columns:\s*1fr/);
});

test("the region and site graph panel is titled only Total Fleet", () => {
  assert.match(source, /<header><div><h2>Total Fleet<\/h2><\/div><strong className="mine-fleet-chart-total"/);
  assert.doesNotMatch(source, /Total fleet by region and site<\/h2>/);
  assert.doesNotMatch(source, /Region-wise site distribution with total fleet count/);
});
