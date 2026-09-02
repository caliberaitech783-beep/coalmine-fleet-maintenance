import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("dashboard equipment and vehicle totals open site-first KPI drilldowns", () => {
  assert.match(source, /openAssetDrilldown\("equipment"\)[\s\S]*Total equipment/);
  assert.match(source, /Total vehicles[\s\S]*assetCounts\.vehicles/);
  assert.match(source, /openAssetDrilldown\("vehicle"\)/);
  assert.match(source, /const siteFirstAssetDrilldown = \["all", "equipment", "vehicle"\]\.includes\(assetDrilldown\)/);
  assert.match(source, /Step 1 · Select site/);
  assert.match(source, /assetSiteBreakdown\.map/);
  assert.match(source, /setAssetDrilldownSite\(site\)/);
  assert.match(source, /assetSiteRows\.length \? assetSiteRows\.map/);
  assert.match(source, /recordBelongsToSite\(record, assetDrilldownSite\)/);
  assert.match(source, /No equipment or vehicles found for \{assetDrilldownSite\}/);
  assert.match(source, /initialCategory=\{equipmentCategory\}/);
  assert.match(source, /assetCategory === "all" \|\| String\(v\.category \|\| ""\)\.trim\(\)\.toLowerCase\(\) === assetCategory/);
  assert.match(source, /<option value="equipment">Equipment<\/option>[\s\S]*<option value="vehicle">Vehicles<\/option>/);
});
