import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("road availability KPIs open live-state equipment names in Breakdown master", () => {
  assert.match(source, /gotoBreakdownFleet\("onroad", selectedSites\)[\s\S]*>On road</);
  assert.match(source, /gotoBreakdownFleet\("offroad", selectedSites\)[\s\S]*>Off road</);
  assert.match(source, /gotoBreakdownFleet\("idle", selectedSites\)[\s\S]*>Idle</);
  assert.match(source, /active === "Breakdown master"[\s\S]*<Equipment initialFilter=\{breakdownFleetFilter\} pageTitle="Breakdown master" statusRequests=\{requests\} allowedLocations=\{breakdownFleetSites\}/);
  assert.match(source, /liveEquipmentRoadStatus\(v, statusRequests\)/);
});
