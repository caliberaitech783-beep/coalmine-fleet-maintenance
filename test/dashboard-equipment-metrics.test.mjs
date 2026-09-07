import test from "node:test";
import assert from "node:assert/strict";
import {
  equipmentMetrics,
  equipmentRoadStatus,
  fleetAssetCounts,
  fleetBreakdownCaseCounts,
  fleetChartCounts,
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

test("fleet chart breakdowns are a subset of each category total, counting assets once", () => {
  const records = [
    ...Array.from({ length: 48 }, (_, index) => ({ category: "Equipment", door: `E${index}` })),
    ...Array.from({ length: 142 }, (_, index) => ({ category: "Vehicle", door: `V${index}` })),
  ];
  const requests = [
    ...Array.from({ length: 8 }, (_, index) => ({ door: `E${index}`, status: "Open" })),
    ...Array.from({ length: 20 }, (_, index) => ({ door: `V${index}`, status: "Open" })),
    { door: "E0", status: "Open" },
    { door: "V20", status: "Closed" },
    { door: "V21", status: "Idle" },
    { door: "V22", status: "Ideal" },
  ];
  assert.deepEqual(fleetChartCounts(records, requests), {
    equipment: 48, vehicles: 142, total: 190,
    breakdown: { equipment: 8, vehicles: 20, total: 28 },
  });
});

test("fleet chart counts only assets with active breakdown requests", () => {
  assert.deepEqual(fleetChartCounts(), {
    equipment: 0, vehicles: 0, total: 0,
    breakdown: { equipment: 0, vehicles: 0, total: 0 },
  });
  assert.deepEqual(fleetChartCounts([
    { category: "Equipment", status: "Off road" },
    { category: "Vehicles", status: "Operational" },
  ]), {
    equipment: 1, vehicles: 1, total: 2,
    breakdown: { equipment: 0, vehicles: 0, total: 0 },
  });
  assert.deepEqual(fleetChartCounts([
    { category: "Equipment", door: "E1", status: "Operational" },
    { category: "Vehicles", door: "V1", status: "Operational" },
  ], [
    { door: "E1", status: "Open" },
    { door: "V1", status: "Closed" },
  ]).breakdown, { equipment: 1, vehicles: 0, total: 1 });
});

test("fleet chart does not match one request to every asset sharing a group value", () => {
  const records = [
    { category: "Vehicles", equipment: "SCANIA TIPPERS", equipmentName: "S1 - MH01", door: "S1" },
    { category: "Vehicles", equipment: "SCANIA TIPPERS", equipmentName: "S2 - MH02", door: "S2" },
  ];
  assert.deepEqual(fleetChartCounts(records, [
    { equipment: "SCANIA TIPPERS", door: "S1", status: "Open" },
  ]).breakdown, { equipment: 0, vehicles: 1, total: 1 });
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

test("fleet breakdown case counts count open requests, not matched assets", () => {
  const records = [
    { category: "Equipment", door: "E1", equipmentName: "Dumper" },
    { category: "Equipment", door: "E2", equipmentName: "Dumper" },
    { category: "Vehicle", door: "V1", reg: "MH31AB1234" },
  ];
  const requests = [
    { door: "E1", status: "Open" },
    { door: "E1", status: "Work in progress" },
    { equipment: "Dumper", status: "Open" },
    { door: "V1", status: "Idle" },
    { door: "V1", status: "Closed" },
    { reg: "MH31ZZ9999", status: "Open" },
  ];
  assert.deepEqual(fleetBreakdownCaseCounts(records, requests), { equipment: 3, vehicles: 2, total: 5 });
  assert.deepEqual(fleetBreakdownCaseCounts(), { equipment: 0, vehicles: 0, total: 0 });
});
