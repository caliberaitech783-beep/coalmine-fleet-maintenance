import test from "node:test";
import assert from "node:assert/strict";
import {
  equipmentMetrics,
  equipmentRoadStatus,
  fleetAssetCounts,
  liveEquipmentMetrics,
} from "../dashboard-equipment-metrics.mjs";

test("dashboard equipment totals use all persisted master records", () => {
  assert.deepEqual(
    equipmentMetrics([
      { status: "Operational" },
      { status: "Breakdown" },
      { status: "Operational" },
    ]),
    { total: 3, onRoad: 2, offRoad: 1, idle: 0, unknown: 0, availability: 67 },
  );
});

test("dashboard equipment totals handle an empty master", () => {
  assert.deepEqual(equipmentMetrics([]), {
    total: 0,
    onRoad: 0,
    offRoad: 0,
    idle: 0,
    unknown: 0,
    availability: 0,
  });
});

test("off-road totals exclude blank and neutral statuses", () => {
  assert.deepEqual(
    equipmentMetrics([
      { status: "" },
      { status: "Available" },
      { status: "In maintenance" },
      { status: "Off-road" },
      { status: "Breakdown" },
    ]),
    { total: 5, onRoad: 0, offRoad: 3, idle: 0, unknown: 2, availability: 0 },
  );
  assert.equal(equipmentRoadStatus({ status: "" }), "unknown");
});

test("idle is a distinct fleet state and is not counted on-road or off-road", () => {
  assert.deepEqual(equipmentMetrics([
    {status:"Operational"}, {status:"Idle"}, {status:"Off road"}, {status:"Idling"},
  ]), {total:4,onRoad:1,offRoad:1,idle:2,unknown:0,availability:25});
  assert.equal(equipmentRoadStatus({status:"Idle"}), "idle");
});

test("fleet totals use only the Equipment Master category column", () => {
  assert.deepEqual(fleetAssetCounts([
    { category: " EQUIPMENT ", group: "Truck" },
    { category: "equipment", chassisNo: "CH-100" },
    { category: "VEHICLE", itemName: "Excavator" },
    { category: "vehicles" },
    { category: "Utility asset", equipmentName: "Pickup" },
  ]), { equipment: 2, vehicles: 2, total: 5 });
});

test("live dashboard availability overlays requests on imported equipment without fleet statuses", () => {
  const equipment = [
    { equipmentName: "D23 - 07339", chassisNo: "7339", status: "" },
    { equipmentName: "HP12 - 10016", chassisNo: "JJ202405310016", status: "" },
    { equipmentName: "VPC60 - 80081", chassisNo: "80081", status: "Idle" },
    { equipmentName: "D16 - 24964", chassisNo: "24964", status: "" },
  ];
  const requests = [
    { equipment: "D23 - 07339", chassis: "7339", status: "Open" },
    { equipment: "HP12 - 10016", chassis: "JJ202405310016", status: "Closed" },
    { equipment: "D16 - 24964", chassis: "24964", status: "Idle" },
  ];
  assert.deepEqual(liveEquipmentMetrics(equipment, requests), {
    total: 4,
    onRoad: 1,
    offRoad: 1,
    idle: 2,
    unknown: 0,
    availability: 25,
  });
});
