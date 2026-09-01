import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("road availability KPIs open live-state equipment drilldowns", () => {
  assert.match(source, /openAssetDrilldown\("onroad"\)[\s\S]*>On road</);
  assert.match(source, /openAssetDrilldown\("offroad"\)[\s\S]*>Off road</);
  assert.match(source, /openAssetDrilldown\("idle"\)[\s\S]*>Idle</);
  assert.match(source, /openAssetDrilldown\("unknown"\)[\s\S]*>Status not set</);
  assert.match(source, /rowsForAssetDrilldown = \(key = ""\)/);
  assert.match(source, /liveEquipmentRoadStatus\(record, visibleBreakdowns\) === key/);
  assert.match(source, /active === "Breakdown master"[\s\S]*<Equipment initialFilter=\{breakdownFleetFilter\} pageTitle="Breakdown master" statusRequests=\{requests\} allowedLocations=\{breakdownFleetSites\}/);
  assert.match(source, /liveEquipmentRoadStatus\(v, statusRequests\)/);
});
