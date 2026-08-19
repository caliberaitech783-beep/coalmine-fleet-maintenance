import test from "node:test";
import assert from "node:assert/strict";
import {
  equipmentMetrics,
  equipmentRoadStatus,
  fleetAssetCounts,
  isVehicleRecord,
} from "../dashboard-equipment-metrics.mjs";

test("dashboard equipment totals use all persisted master records", () => {
  assert.deepEqual(
    equipmentMetrics([
      { status: "Operational" },
      { status: "Breakdown" },
      { status: "Operational" },
    ]),
    { total: 3, onRoad: 2, offRoad: 1, availability: 67 },
  );
});

test("dashboard equipment totals handle an empty master", () => {
  assert.deepEqual(equipmentMetrics([]), {
    total: 0,
    onRoad: 0,
    offRoad: 0,
    availability: 0,
  });
});

test("blank and neutral statuses are not counted as off road", () => {
  assert.deepEqual(
    equipmentMetrics([
      { status: "" },
      { status: "Available" },
      { status: "In maintenance" },
      { status: "Off-road" },
      { status: "Breakdown" },
    ]),
    { total: 5, onRoad: 0, offRoad: 3, availability: 0 },
  );
});

test("road-status drill-down uses the same explicit status rules", () => {
  assert.equal(equipmentRoadStatus({ status: "Operational" }), "onroad");
  assert.equal(equipmentRoadStatus({ status: "In-maintenance" }), "offroad");
  assert.equal(equipmentRoadStatus({ status: "" }), "unknown");
});

test("fleet totals separate vehicles from other equipment", () => {
  const records = [
    { group: "Excavator" },
    { category: "Water truck" },
    { itemName: "Office equipment" },
    { equipmentName: "Pickup" },
    { chassisNo: "CH-100", category: "Utility asset" },
  ];
  assert.equal(isVehicleRecord(records[0]), false);
  assert.equal(isVehicleRecord(records[1]), true);
  assert.deepEqual(fleetAssetCounts(records), {
    equipment: 2,
    vehicles: 3,
    total: 5,
  });
});
