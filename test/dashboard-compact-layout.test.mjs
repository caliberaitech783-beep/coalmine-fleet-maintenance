import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync(new URL("../src/dashboard-concept-a.css", import.meta.url), "utf8");
const client = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("repair types render as a responsive graph instead of KPI cards", () => {
  assert.match(client, /className="mine-panel mine-repair-type-chart"/);
  assert.match(client, /<h2>Maintenance Type<\/h2>/);
  assert.doesNotMatch(client, /Breakdown requests by configured repair type/);
  assert.match(client, /value \/ maxRepairTypeCount/);
  assert.match(client, /openAssetDrilldown\(`repair:\$\{label\}`\)/);
  assert.doesNotMatch(client, /<section className="mine-counter-grid"/);
  assert.match(css, /\.mine-repair-type-bars button\s*\{[\s\S]*grid-template-columns:\s*minmax\(110px, \.55fr\) minmax\(160px, 2fr\) 48px/);
  assert.match(css, /@media \(max-width: 500px\)[\s\S]*\.mine-repair-type-bars button\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\) auto/);
});

test("Total Fleet leads the dashboard and Maintenance Type shares a row with Road Availability", () => {
  const featureRow = client.indexOf('className="mine-dashboard-feature-row"');
  const totalFleet = client.indexOf('mine-panel mine-fleet-region-chart', featureRow);
  const repairType = client.indexOf('className="mine-panel mine-repair-type-chart"', featureRow);
  const roadAvailability = client.indexOf('className="mine-primary-kpi-card mine-road-status-graphic mine-feature-road-availability"', repairType);
  const intelligence = client.indexOf('className="mine-dashboard-grid mine-dashboard-core"', featureRow);
  assert.ok(featureRow >= 0 && totalFleet > featureRow && repairType > totalFleet && roadAvailability > repairType && intelligence > roadAvailability);
  assert.match(css, /\.mine-dashboard-feature-row\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(client, /className="mine-road-availability-summary"/);
  assert.match(client, /className="mine-road-distribution"/);
  assert.match(client, /roadStatusShare\(kpis\.onRoad\)\.toFixed\(1\)/);
});

test("Road Availability status tiles keep readable contrast in both themes", () => {
  assert.match(css, /\.mine-feature-road-availability \.mine-road-status-values button\.onroad \{ background: #edf9f4;[^}]*color: #173d31;/);
  assert.match(css, /\.mine-feature-road-availability \.mine-road-status-values button\.offroad \{ background: #fff2f1;[^}]*color: #572b28;/);
  assert.match(css, /\.mine-feature-road-availability \.mine-road-status-values button\.idle \{ background: #fff8e8;[^}]*color: #513c17;/);
  assert.match(css, /\.mine-feature-road-availability \.mine-road-status-values small \{ color: currentColor;/);
  assert.doesNotMatch(css, /\.mine-dashboard-night \.mine-feature-road-availability \.mine-road-status-values button \{ background: #203338; \}/);
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
