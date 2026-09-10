import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/dashboard-concept-a.css", import.meta.url), "utf8");
const readabilityCss = fs.readFileSync(new URL("../src/dashboard-readability.css", import.meta.url), "utf8");

test("fleet intelligence connects category and group drilldowns without a region-site subpanel", () => {
  assert.match(source, /className="mine-panel mine-fleet-command"/);
  assert.match(source, /Total Equipment Intelligence/);
  assert.doesNotMatch(source, /<span className="mine-eyebrow">Fleet registry<\/span>/);
  assert.doesNotMatch(source, /Category, equipment group, region and site-wise fleet distribution/);
  assert.match(source, /aria-label="Interactive asset category pie chart"/);
  assert.match(source, /aria-label="Interactive equipment groups pie chart"/);
  assert.match(source, /assetCategoryPieSlices\.map/);
  assert.match(source, /fleetGroupPieSlices\.map/);
  assert.match(source, /fleetHierarchySlices\.map/);
  assert.match(source, /openAssetDrilldown\(slice\.key\)/);
  assert.match(source, /fleetRegionInsights\.map/);
  assert.match(source, /region\.sites\.map/);
  assert.match(source, /fleetChartMode === "total" \? "site" : "offroad-site"/);
  assert.match(source, /const liveBreakdownAssetCount = liveFleetCounts\.breakdown\.total/);
  assert.match(source, /mode === "total" \? assetCounts\.total : liveBreakdownAssetCount/);
  assert.match(source, /region\.total\.toLocaleString\(\)\} fleet/);
  assert.match(source, /const siteRequests = liveBreakdowns\.filter\(\(request\) => recordBelongsToSite\(request, site\)\);/);
  assert.match(source, /\.\.\.fleetChartCounts\(records, siteRequests\)/);
  assert.match(source, /\.\.\.fleetChartCounts\(records, regionRequests\)/);
  assert.doesNotMatch(source, /breakdown: fleetBreakdownCaseCounts\(/);
  assert.match(source, /key\.startsWith\("site:"\)/);
  assert.match(css, /\.mine-fleet-command-body\s*\{[\s\S]*grid-template-columns:/);
  assert.match(css, /\.mine-pie-chart\s*\{/);
  assert.match(css, /\.mine-request-lifecycle-summary button b \{ display: block; overflow: hidden; font-size: 7\.5px; line-height: 1\.15; \}/);
  assert.match(css, /\.mine-request-lifecycle-summary button strong \{ justify-self: end; font: 900 15px\/1 Manrope; white-space: nowrap; \}/);
  assert.match(css, /\.mine-pie-slice\s*\{[\s\S]*cursor:\s*pointer/);
  assert.doesNotMatch(source, /className="mine-fleet-geography"/);
  assert.doesNotMatch(source, /className="mine-panel mine-open-cases"/);
});

test("equipment intelligence offers a remembered combined hierarchical chart and split view", () => {
  assert.match(source, /nerveCenterFleetIntelligenceView/);
  assert.match(source, /setFleetIntelligenceView\("combined"\)/);
  assert.match(source, /setFleetIntelligenceView\("split"\)/);
  assert.match(source, /Combined asset category and equipment group chart/);
  assert.match(source, /className="mine-hierarchy-slice outer"/);
  assert.match(source, /className="mine-hierarchy-slice inner"/);
  assert.match(source, /openAssetDrilldown\(slice\.drilldownKey\)/);
  assert.match(css, /\.mine-hierarchy-layout\s*\{[^}]*grid-template-columns:/);
  assert.match(css, /\.mine-hierarchy-groups\s*\{[^}]*overflow-y:\s*auto/);
});

test("total fleet renders a region-grouped site count graph", () => {
  assert.match(source, /data-mode=\{fleetChartMode\}/);
  assert.match(source, /const fleetChartAxisMax =/);
  assert.match(source, /fleetChartTicks\.map/);
  assert.match(source, /fleetRegionInsights\.map\(\(region\) => <section/);
  assert.match(source, /region\.sites\.map\(\(site\) => <div className="mine-fleet-site-entry"/);
  assert.match(source, /<FleetSiteBars site=\{site\} axisMax=\{fleetChartAxisMax\} showBreakdown=\{showFleetBreakdowns\}/);
  assert.match(source, /className="mine-fleet-chart-toggle"/);
  assert.match(css, /\.mine-fleet-region-chart\s*\{/);
  assert.match(source, /<h2>Total Fleet<\/h2>/);
  assert.match(css, /\.mine-fleet-chart-regions\s*\{/);
});

test("dashboard opens in Breakdown fleet mode by default", () => {
  assert.match(source, /const \[fleetChartMode, setFleetChartMode\] = useState\("breakdown"\);/);
});

test("breakdown mode keeps total counts and green segments on one common scale", () => {
  assert.match(source, /\.\.\.fleetChartCounts\(records, siteRequests\)/);
  assert.match(source, /setFleetChartMode\(mode\)/);
  assert.match(css, /\.mine-fleet-breakdown-segment\s*\{[^}]*background: var\(--fleet-breakdown\);/);
  assert.match(css, /\.mine-fleet-chart-legend i\.breakdown\s*\{[^}]*background: var\(--fleet-breakdown\);/);
  const bars = fs.readFileSync(new URL("../src/fleet-site-bars.jsx", import.meta.url), "utf8");
  assert.match(bars, /fleetBarHeightPercent\(total, scale, showBreakdown, breakdownScaleMax\)/);
  assert.match(bars, /fleetBarHeightPercent\(breakdown, scale, showBreakdown, breakdownScaleMax\)/);
  assert.match(bars, /Math\.max\(1, nonNegativeCount\(axisMax\), total\)/);
  assert.match(bars, /showBreakdown && breakdown > 0/);
  assert.match(bars, /className="mine-fleet-breakdown-count"/);
  assert.match(source, /const fleetChartAllKey = showFleetBreakdowns \? "fleet-breakdown:all" : "all"/);
  assert.match(css, /--fleet-equipment: var\(--brand-red\)/);
  assert.match(css, /--fleet-vehicles: var\(--brand-purple\)/);
});

test("Total Fleet uses the approved taller card and wider site bars", () => {
  assert.match(css, /\.mine-dashboard-feature-row \.mine-fleet-chart-layout\s*\{[^}]*min-height:\s*281px;[^}]*height:\s*326px/);
  assert.match(css, /\.mine-fleet-bar-column\s*\{[^}]*width:\s*clamp\(34px, 2\.2vw, 42px\)/);
  assert.match(readabilityCss, /\.mine-dashboard-feature-row \.mine-fleet-chart-layout\s*\{[^}]*height:\s*390px;[^}]*min-height:\s*360px/);
  assert.match(readabilityCss, /\.mine-dashboard \.mine-fleet-bar-column\s*\{[^}]*width:\s*clamp\(44px, 3vw, 58px\)/);
  assert.match(readabilityCss, /\.mine-dashboard \.mine-fleet-breakdown-count\s*\{[^}]*font-size:\s*18px !important/);
  assert.match(source, /<small className="mine-fleet-site-summary"><b>\{site\.name\}<\/b>/);
  assert.match(source, /openAssetDrilldown\(`offroad-site:\$\{site\.name\}`\)\}>Total BD \{site\.breakdown\.total\.toLocaleString\(\)\}<\/button>/);
  assert.match(source, /openAssetDrilldown\(`site:\$\{site\.name\}`\)\}>Total Fleet \{site\.total\.toLocaleString\(\)\}<\/button>/);
  assert.match(readabilityCss, /\.mine-dashboard \.mine-fleet-site-summary button\s*\{/);
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

test("breakdown trend is compact, forecast-aware, responsive and site selectable", () => {
  // Site ranking was removed from the dashboard; nothing may reintroduce it.
  assert.doesNotMatch(source, /mine-trend-sites/);
  assert.doesNotMatch(source, /Site ranking/);
  assert.doesNotMatch(css, /\.mine-trend-sites/);
  // The constants that only fed that list must go with it.
  assert.doesNotMatch(source, /breakdownTrendSites/);
  assert.doesNotMatch(source, /maxBreakdownTrendSite/);
  assert.match(source, /className="mine-dashboard-lower-grid"/);
  assert.match(source, /<h2>Overall Fleet Performance<\/h2>/);
  assert.match(css, /\.mine-dashboard-lower-grid\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.mine-breakdown-trend-body\s*\{[^}]*grid-template-columns: 135px minmax\(0, 1fr\);/);
  assert.match(css, /\.mine-breakdown-trend-body\s*\{[\s\S]*grid-template-columns:/);
  assert.match(css, /\.mine-trend-period button\.active/);
  assert.match(css, /\.mine-trend-day\.forecast > span i/);
  assert.match(css, /\.mine-performance-gauges/);
  assert.match(css, /\.mine-trend-chart\s*\{[\s\S]*overflow-x:\s*auto/);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*\.mine-breakdown-trend-body\s*\{\s*grid-template-columns:\s*1fr/);
});

test("breakdown trend summary no longer shows the forecast count card", () => {
  // The "Forecast / Next N days" summary card was removed; only Recorded and Daily baseline remain.
  assert.doesNotMatch(source, /<span>Forecast<\/span>/);
  assert.doesNotMatch(source, /Next \{breakdownTrendDays\} days/);
  assert.doesNotMatch(source, /breakdownForecastTotal/);
  assert.doesNotMatch(source, /forecastTrendDays/);
  assert.match(source, /<span>Recorded<\/span>/);
  assert.match(source, /<span>Daily baseline<\/span>/);
});

test("breakdown trend chart drops the forecast legend, view toggle and wording", () => {
  assert.doesNotMatch(source, /<i className="forecast" \/>Forecast/);
  assert.doesNotMatch(source, /listAction\("trend:forecast"/);
  assert.doesNotMatch(source, /\["upcoming", "Upcoming"\]/);
  assert.doesNotMatch(source, /className="mine-trend-view" role="group"/);
  assert.doesNotMatch(source, /weekday-weighted upcoming estimates/);
  assert.doesNotMatch(source, /actual and forecast breakdown chart/);
  assert.match(source, /<i className="actual" \/>Actual<\/span><b aria-label="Breakdown trend selected period">From:/);
  assert.match(source, /day recorded breakdown chart`\}/);
});

test("the region and site graph panel is titled only Total Fleet", () => {
  assert.match(source, /<h2>Total Fleet<\/h2>/);
  assert.match(source, /className="mine-fleet-chart-title" aria-label="Drill down Total Fleet" onClick=\{\(\) => openAssetDrilldown\(fleetChartAllKey\)\}/);
  assert.doesNotMatch(source, /className="mine-fleet-chart-y"/);
  assert.doesNotMatch(source, /fleet-muted/);
  assert.doesNotMatch(source, /Total fleet by region and site<\/h2>/);
  assert.doesNotMatch(source, /Region-wise site distribution with total fleet count/);
});

test("breakdown segment clicks open only that site and category of off-road assets", () => {
  assert.match(source, /event\.target\.closest\("\.mine-fleet-breakdown-segment"\)\?\.closest\("\.mine-fleet-bar-column"\)/);
  assert.match(source, /\x60offroad-site:\$\{site\.name\}\|\$\{segmentColumn\.classList\.contains\("vehicles"\) \? "vehicles" : "equipment"\}\x60/);
  assert.match(source, /const \[offroadSite, offroadCategory = ""\] = key\.startsWith\("offroad-site:"\) \? key\.slice\(13\)\.split\("\|"\) : \["", ""\];/);
  assert.match(source, /key !== "fleet-breakdown:equipment" && offroadCategory !== "equipment"/);
  assert.match(source, /key !== "fleet-breakdown:vehicles" && offroadCategory !== "vehicles"/);
  assert.match(source, /assetDrilldown\.startsWith\("offroad-site:"\) \? assetDrilldown\.slice\(13\)\.split\("\|"\)\[0\] : assetDrilldown\.startsWith\("site:"\)/);
});

test("fleet chart uses the same labelled enlarged scale for its grid and bars", () => {
  assert.match(source, /const fleetChartStep = 25;/);
  assert.match(source, /const fleetChartAxisMax = Math.max\(fleetChartStep, Math.ceil\(fleetChartPeak \/ fleetChartStep\) \* fleetChartStep\);/);
  assert.doesNotMatch(source, /const fleetChartScale = dashboardCountScale/);
  assert.match(source, /fleetBarHeightPercent\(tick, fleetChartAxisMax, showFleetBreakdowns, fleetBreakdownScaleMax\)/);
  assert.match(source, /breakdownScaleMax=\{fleetBreakdownScaleMax\}/);
  assert.match(source, /Breakdown scale: 0–\{fleetBreakdownScaleMax\} enlarged uniformly; totals continue above this range\./);
  assert.match(readabilityCss, /\.mine-dashboard \.mine-fleet-breakdown-segment \{ min-height: 0; max-height: none; \}/);
});

test("partial breakdown segments cannot be stretched or clipped differently at different sites", () => {
  assert.doesNotMatch(readabilityCss, /\.mine-fleet-breakdown-segment[^}]*min\(30px/);
  assert.doesNotMatch(readabilityCss, /\.mine-fleet-breakdown-segment[^}]*calc\(100% - 18px\)/);
});
