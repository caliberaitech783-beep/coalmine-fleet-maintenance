import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const client = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("dashboard vehicle composition shows every equipment group", () => {
  assert.match(client, /const fleetGroupInsights = summarizeEquipment\(visibleEquipment\)\.map/);
  assert.match(client, /const fleetHierarchySlices = pieSlices\(fleetHierarchyCategories\.flatMap/);
  assert.match(client, /fleetHierarchySlices\.map\(\(slice\) => <circle/);
  assert.doesNotMatch(client, /fleetGroupInsights = [^;]*\.slice\(/);
  assert.match(client, /drilldownKey: `group:\$\{label\}`/);
  assert.match(client, /openAssetDrilldown\(slice\.drilldownKey\)/);
  assert.match(client, /equipmentGroupLabel\(record\) === key\.slice\(6\)/);
});
