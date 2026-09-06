import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync(new URL("../src/dashboard-concept-a.css", import.meta.url), "utf8");
const client = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("Total Fleet leads a single combined maintenance and road availability panel", () => {
  const featureRow = client.indexOf('className="mine-dashboard-feature-row"');
  const totalFleet = client.indexOf('mine-panel mine-fleet-region-chart', featureRow);
  const combinedPanel = client.indexOf('className="mine-panel mine-maintenance-availability-panel"', featureRow);
  const intelligence = client.indexOf('className="mine-dashboard-grid mine-dashboard-core"', featureRow);
  assert.ok(featureRow >= 0 && totalFleet > featureRow && combinedPanel > totalFleet && intelligence > combinedPanel);
  assert.match(client, /<h2>Maintenance &amp; Road Availability<\/h2>/);
  assert.match(client, /maintenanceAvailabilityTab/);
  assert.match(client, /Site-wise BD Movement/);
  assert.match(client, /Road Availability/);
  assert.match(css, /\.mine-maintenance-availability-panel\s*\{[\s\S]*?grid-column:\s*1 \/ -1/);
  assert.doesNotMatch(client, /className="mine-panel mine-repair-type-chart"/);
  assert.doesNotMatch(client, /className="mine-primary-kpi-card mine-road-status-graphic mine-feature-road-availability"/);
});

test("site breakdown view reconciles one-line site totals and opens day-wise controls", () => {
  assert.match(client, /breakdownMovementForRange/);
  assert.match(client, /dailyBreakdownMovement/);
  assert.match(client, /<span>Site name<\/span><span>BD Open<\/span><span>BD In<\/span><span>BD Out<\/span><span>BD Balance<\/span><span>Road availability impact<\/span>/);
  assert.match(client, /\[2, 5, 10\]\.map/);
  assert.match(client, /aria-label="Breakdown movement from date"/);
  assert.match(client, /aria-label="Breakdown movement to date"/);
  assert.match(client, /aria-label="Custom breakdown movement days"/);
  assert.match(css, /\.mine-breakdown-site-head,[\s\S]*?\.mine-breakdown-site-row\s*\{[\s\S]*?grid-template-columns:/);
});

test("each site links breakdown movement with its current road availability", () => {
  assert.match(client, /const roadAvailabilityBySiteName = new Map/);
  assert.match(client, /className="mine-breakdown-road-impact"/);
  assert.match(client, /road\.onRoad.*On ·.*road\.offRoad.*Off ·.*road\.idle.*Idle/);
  assert.match(client, /className="dashboard-site-road-impact"/);
  assert.match(client, /BD balance in the selected period/);
  assert.match(client, /Road availability <ChevronRight \/>/);
  assert.match(client, /openRoadAvailabilityForSite\(breakdownDetailSite\)/);
  assert.match(client, /roadFocusSite === site\.site/);
  assert.match(css, /\.mine-breakdown-road-impact\s*\{/);
  assert.match(css, /\.dashboard-site-road-impact\s*\{/);
});

test("the maintenance summary defines all six BD types with intake percentages", () => {
  assert.match(client, /breakdownTypeShare\(locationBreakdowns, breakdownSummaryStartKey, breakdownSummaryEndKey\)/);
  assert.match(client, /BD Type Mix/);
  assert.match(client, /Percentage share of BD In/);
  assert.match(client, /breakdownDetailTypeSummary\.map/);
  assert.match(css, /\.mine-breakdown-type-mix > div\s*\{[\s\S]*?grid-template-columns:\s*repeat\(6/);
});

test("Road Availability provides site-wise on-road, off-road and idle status", () => {
  assert.match(client, /roadAvailabilityBySite\.length/);
  assert.match(client, /<span>Total fleet<\/span><span>On road<\/span><span>Off road<\/span><span>Idle<\/span><span>Availability<\/span>/);
  assert.match(client, /className="mine-road-site-bar"/);
  assert.match(css, /\.mine-road-site-row\s*\{[\s\S]*?grid-template-columns:/);
  assert.match(css, /\.mine-site-road-summary \.onroad \{ --summary-color: #173d31;/);
  assert.match(css, /\.mine-site-road-summary \.offroad \{ --summary-color: #572b28;/);
  assert.match(css, /\.mine-site-road-summary \.idle \{ --summary-color: #513c17;/);
});

test("equipment intelligence and request lifecycle share a responsive row", () => {
  assert.match(css, /\.mine-dashboard-core\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(max-width: 1100px\)[\s\S]*?\.mine-dashboard-core\s*\{\s*grid-template-columns:\s*1fr/);
  assert.match(client, /className="mine-panel mine-fleet-command"/);
  assert.match(client, /className="mine-panel mine-request-lifecycle"/);
  assert.doesNotMatch(client, /className="mine-primary-kpi-grid"/);
  assert.doesNotMatch(client, /Key performance indicators/);
  assert.doesNotMatch(client, /className="mine-fleet-geography"/);
});

test("request lifecycle offers preset and custom date controls", () => {
  assert.match(client, /\[7, 14, 30\]\.map/);
  assert.match(client, /aria-label="Request lifecycle from date"/);
  assert.match(client, /aria-label="Request lifecycle to date"/);
  assert.match(css, /\.mine-request-lifecycle-controls/);
});

test("request lifecycle graph uses separate brand-colored bars", () => {
  assert.match(client, /\["opened", "closed", "verified", "idle"\]/);
  assert.match(css, /button\.opened\s*\{\s*background:\s*#315fd4/);
  assert.match(css, /button\.closed\s*\{\s*background:\s*#f04e53/);
  assert.match(css, /button\.verified\s*\{\s*background:\s*#26956f/);
});
