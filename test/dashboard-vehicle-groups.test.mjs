import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const client = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("dashboard vehicle composition shows every equipment group", () => {
  assert.match(client, /const fleetGroupInsights = summarizeEquipment\(visibleEquipment\)\.map/);
  assert.match(client, /fleetGroupPieSlices\.map\(\(slice\) => <circle/);
  assert.doesNotMatch(client, /fleetGroupInsights = [^;]*\.slice\(/);
  assert.match(client, /key: `group:\$\{group\.label\}`/);
  assert.match(client, /openAssetDrilldown\(slice\.key\)/);
  assert.match(client, /equipmentGroupLabel\(record\) === key\.slice\(6\)/);
});
