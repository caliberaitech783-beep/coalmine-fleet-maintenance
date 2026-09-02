import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("dashboard equipment and vehicle totals drill down from region to site and type", () => {
  assert.match(source, /openAssetDrilldown\("equipment"\)[\s\S]*Total equipment/);
  assert.match(source, /Total vehicles[\s\S]*assetCounts\.vehicles/);
  assert.match(source, /openAssetDrilldown\("vehicle"\)/);
  assert.match(source, /const siteFirstAssetDrilldown = \["all", "equipment", "vehicle"\]\.includes\(assetDrilldown\)/);
  assert.match(source, /Step 1 · Select location level/);
  assert.match(source, />Region<\/button>/);
  assert.match(source, /Step 2 · Select region/);
  assert.match(source, /assetDrilldownRegions\.map/);
  assert.match(source, /Step 3 · Select \{selectedAssetRegion\.code\} site/);
  assert.match(source, /setAssetDrilldownSite\(site\.name\)/);
  assert.match(source, /Step 4 · \{assetDrilldownSite\} fleet totals/);
  assert.match(source, /assetSiteCategoryBreakdown\.map/);
  assert.match(source, /Step 5 · Select/);
  assert.match(source, /assetSiteGroupBreakdown\.map/);
  assert.match(source, /assetSiteGroupRows\.map/);
  assert.match(source, /recordBelongsToSite\(record, assetDrilldownSite\)/);
  assert.match(source, /No equipment or vehicles found for \{assetDrilldownSite\}/);
  assert.match(source, /initialCategory=\{equipmentCategory\}/);
  assert.match(source, /assetCategory === "all" \|\| String\(v\.category \|\| ""\)\.trim\(\)\.toLowerCase\(\) === assetCategory/);
  assert.match(source, /<option value="equipment">Equipment<\/option>[\s\S]*<option value="vehicle">Vehicles<\/option>/);
});
