import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("dashboard equipment and vehicle totals drill down from region to site and type", () => {
  assert.match(source, /\{ label: "Equipment", total: assetCounts\.equipment, key: "equipment"/);
  assert.match(source, /\{ label: "Vehicles", total: assetCounts\.vehicles, key: "vehicle"/);
  assert.match(source, /assetCategoryPieSlices\.map\(\(slice\) => <button[^>]*onClick=\{\(\) => openAssetDrilldown\(slice\.key\)\}/);
  assert.match(source, /<DashboardRecordBrowser key=\{assetDrilldown\} rows=\{assetDrilldownRows\} regions=\{assetDrilldownRegions\}/);
  assert.match(source, /const assetDrilldownRegions = availableRegions\.map/);
  assert.doesNotMatch(source, /Step 1 · Select region|Step 5 · Full details/);
  assert.match(source, /initialCategory=\{equipmentCategory\}/);
  assert.match(source, /assetCategory === "all" \|\| String\(v\.category \|\| ""\)\.trim\(\)\.toLowerCase\(\) === assetCategory/);
  assert.match(source, /<option value="equipment">Equipment<\/option>[\s\S]*<option value="vehicle">Vehicles<\/option>/);
});
