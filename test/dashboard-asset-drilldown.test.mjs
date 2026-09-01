import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("dashboard equipment and vehicle totals open three-step KPI drilldowns", () => {
  assert.match(source, /openAssetDrilldown\("equipment"\)[\s\S]*Total equipment/);
  assert.match(source, /Total vehicles[\s\S]*assetCounts\.vehicles/);
  assert.match(source, /openAssetDrilldown\("vehicle"\)/);
  assert.match(source, /Step 1 · KPI summary/);
  assert.match(source, /Step 2 · Equipment category \/ group/);
  assert.match(source, /Step 3 · Equipment list/);
  assert.match(source, /assetCategoryBreakdown\.map/);
  assert.match(source, /assetGroupBreakdown\.length \? assetGroupBreakdown\.map/);
  assert.match(source, /assetDrilldownVisibleRows\.map/);
  assert.match(source, /initialCategory=\{equipmentCategory\}/);
  assert.match(source, /assetCategory === "all" \|\| String\(v\.category \|\| ""\)\.trim\(\)\.toLowerCase\(\) === assetCategory/);
  assert.match(source, /<option value="equipment">Equipment<\/option>[\s\S]*<option value="vehicle">Vehicles<\/option>/);
});
