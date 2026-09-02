import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync(
  new URL("../src/dashboard-concept-a.css", import.meta.url),
  "utf8",
);
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
  assert.match(client, /className="mine-dashboard-feature-row"/);
  const featureRow = client.indexOf('className="mine-dashboard-feature-row"');
  const totalFleet = client.indexOf('className="mine-panel mine-fleet-region-chart"', featureRow);
  const repairType = client.indexOf('className="mine-panel mine-repair-type-chart"', featureRow);
  const roadAvailability = client.indexOf('className="mine-primary-kpi-card mine-road-status-graphic mine-feature-road-availability"', repairType);
  const compactKpis = client.indexOf('className="mine-primary-kpi-grid"', featureRow);
  assert.ok(featureRow >= 0 && totalFleet > featureRow && repairType > totalFleet && roadAvailability > repairType && compactKpis > roadAvailability);
  assert.match(css, /\.mine-dashboard-feature-row\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.mine-dashboard-feature-row > \.mine-feature-road-availability\s*\{[\s\S]*?grid-column:\s*span 1/);
  assert.match(client, /className="mine-road-distribution"/);
  assert.match(client, /roadStatusShare\(kpis\.onRoad\)\.toFixed\(1\)/);
  assert.match(css, /\.mine-road-availability-body\s*\{[\s\S]*?grid-template-columns:\s*118px minmax\(0, 1fr\)/);
});

test("primary KPIs remain compact after Road Availability moves beside Maintenance Type", () => {
  assert.match(
    css,
    /\.mine-primary-kpi-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);/,
  );
  assert.match(
    css,
    /@media \(max-width:\s*1000px\)[\s\S]*?\.mine-primary-kpi-grid\s*\{\s*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/,
  );
  assert.match(client, /className="mine-primary-kpi-card mine-primary-kpi-assets"/);
  assert.match(client, /className="mine-primary-kpi-card mine-road-status-graphic mine-feature-road-availability"/);
  assert.match(client, /className="mine-road-status-chart"/);
  assert.match(css, /\.mine-road-status-graphic\s*\{[\s\S]*?grid-column:\s*span 2;/);
  assert.match(client, /<b>Total Fleet<\/b>/);
  assert.match(client, /<b>On road<\/b>/);
  assert.match(client, /<b>Off road<\/b>/);
  assert.match(client, /<b>Idle<\/b>/);
  assert.match(client, /className="mine-primary-kpi-card mine-primary-kpi-workload mine-open-requests-graphic"/);
  assert.match(client, /Consolidated open requests/);
  assert.match(client, /openRequestStatusItems\.map/);
  assert.doesNotMatch(client, /className="mine-open-requests-bar"/);
  assert.doesNotMatch(client, /\{ key: "Awaiting", label: "Awaiting"/);
  assert.match(css, /\.mine-open-requests-values\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,/);
  assert.match(css, /button\.open\s*\{[\s\S]*#df6d64/);
  assert.match(css, /button\.progress\s*\{[\s\S]*#d5a62d/);
  assert.match(css, /button\.idle\s*\{[\s\S]*#8b6abd18/);
  assert.match(client, /<b>Operations users<\/b>/);
});

test("the in-progress status button has no background fill", () => {
  assert.match(
    css,
    /\.mine-open-requests-values button\.progress \{ border-color:#d5a62d; color:#936c00; \}/,
  );
  assert.doesNotMatch(css, /button\.progress\s*\{[^}]*background/);
});

test("the fleet KPI card shows only the Total Fleet name", () => {
  assert.match(
    client,
    /<span className="mine-primary-kpi-copy"><b>Total Fleet<\/b><\/span>/,
  );
  assert.doesNotMatch(client, /Equipment &amp; vehicles/);
  assert.doesNotMatch(client, /All registered assets/);
});
