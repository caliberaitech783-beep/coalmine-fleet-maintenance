import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("road availability KPIs open live-state equipment drilldowns", () => {
  assert.match(source, /openAssetDrilldown\("road-availability"\)/);
  assert.match(source, /openAssetDrilldown\("onroad"\)[\s\S]*>On road</);
  assert.match(source, /openAssetDrilldown\("offroad"\)[\s\S]*>Off road</);
  assert.match(source, /openAssetDrilldown\("idle"\)[\s\S]*>Idle</);
  assert.doesNotMatch(source, /className="mine-primary-kpi-grid"/);
  assert.match(source, /rowsForAssetDrilldown = \(key = ""\)/);
  assert.match(source, /liveEquipmentRoadStatus\(record, availabilityRequests\) === key/);
  assert.match(source, /const assetDrilldownRows = rowsForAssetDrilldown\(assetDrilldown\)/);
  assert.match(source, /rows=\{assetDrilldownRows\} regions=\{assetDrilldownRegions\}/);
  assert.match(source, /active === "Breakdown master"[\s\S]*<Equipment initialFilter=\{breakdownFleetFilter\} pageTitle="Breakdown master" statusRequests=\{requests\} allowedLocations=\{breakdownFleetSites\}/);
  assert.match(source, /const roadStatusFor = \(record\) => Array\.isArray\(statusRequests\)[\s\S]*liveEquipmentRoadStatus\(record, statusRequests\)/);
  assert.match(source, /roadStatusFor\(v\) === road/);
});
