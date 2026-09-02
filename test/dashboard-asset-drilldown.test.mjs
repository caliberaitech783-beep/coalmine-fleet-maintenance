import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("dashboard equipment and vehicle totals drill down from region to site and type", () => {
  assert.match(source, /openAssetDrilldown\("equipment"\)[\s\S]*Total equipment/);
  assert.match(source, /Total vehicles[\s\S]*assetCounts\.vehicles/);
  assert.match(source, /openAssetDrilldown\("vehicle"\)/);
  assert.match(source, /const siteFirstAssetDrilldown = \["all", "equipment", "vehicle", "road-availability", "onroad", "offroad", "idle", "unknown"\]\.includes\(assetDrilldown\)/);
  assert.doesNotMatch(source, /Select location level/);
  assert.match(source, /Step 1 · Select region/);
  assert.match(source, /assetDrilldownRegions\.map/);
  assert.match(source, /Step 2 · Select \{selectedAssetRegion\.code\} site/);
  assert.match(source, /setAssetDrilldownSite\(site\.name\)/);
  assert.match(source, /Step 3 · \{assetDrilldownSite\} fleet totals/);
  assert.match(source, /assetSiteCategoryBreakdown\.map/);
  assert.match(source, /Step 4 · Select/);
  assert.match(source, /assetSiteGroupBreakdown\.map/);
  assert.match(source, /assetSiteGroupRows\.map/);
  assert.match(source, /aria-label="Back to regions"/);
  assert.match(source, /className="dashboard-asset-back"/);
  assert.match(source, /onClick=\{\(\) => setAssetDrilldownGroup\(""\)\}/);
  assert.match(source, /recordBelongsToSite\(record, assetDrilldownSite\)/);
  assert.match(source, /No equipment or vehicles found for \{assetDrilldownSite\}/);
  assert.match(source, /initialCategory=\{equipmentCategory\}/);
  assert.match(source, /assetCategory === "all" \|\| String\(v\.category \|\| ""\)\.trim\(\)\.toLowerCase\(\) === assetCategory/);
  assert.match(source, /<option value="equipment">Equipment<\/option>[\s\S]*<option value="vehicle">Vehicles<\/option>/);
});
