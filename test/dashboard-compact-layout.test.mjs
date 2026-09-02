import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync(
  new URL("../src/dashboard-concept-a.css", import.meta.url),
  "utf8",
);
const client = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("dashboard KPI cards use a compact responsive grid", () => {
  assert.match(css, /Compact command-centre density/);
  assert.match(
    css,
    /\.mine-counter-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(145px,\s*1fr\)\);[\s\S]*?grid-auto-rows:\s*49px;/,
  );
  assert.match(
    css,
    /@media \(max-width:\s*1100px\)[\s\S]*?\.mine-counter-grid\s*\{\s*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/,
  );
  assert.match(
    css,
    /@media \(max-width:\s*700px\)[\s\S]*?\.mine-counter-grid\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/,
  );
});

test("six primary KPIs share one compact desktop row", () => {
  assert.match(
    css,
    /\.mine-primary-kpi-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\);/,
  );
  assert.match(
    css,
    /@media \(max-width:\s*1000px\)[\s\S]*?\.mine-primary-kpi-grid\s*\{\s*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/,
  );
  assert.match(client, /className="mine-primary-kpi-card mine-primary-kpi-assets"/);
  assert.match(client, /<b>Total Fleet<\/b>/);
  assert.match(client, /<b>On road<\/b>/);
  assert.match(client, /<b>Off road<\/b>/);
  assert.match(client, /<b>Idle<\/b>/);
  assert.match(client, /<b>Maintenance workload<\/b>/);
  assert.match(client, /<b>Operations users<\/b>/);
});

test("the fleet KPI card shows only the Total Fleet name", () => {
  assert.match(
    client,
    /<span className="mine-primary-kpi-copy"><b>Total Fleet<\/b><\/span>/,
  );
  assert.doesNotMatch(client, /Equipment &amp; vehicles/);
  assert.doesNotMatch(client, /All registered assets/);
});
