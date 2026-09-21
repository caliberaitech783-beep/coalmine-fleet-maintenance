import test from "node:test";
import assert from "node:assert/strict";
import {
  latestCompletedVehicleRepair,
  vehicleHistoryKey,
  vehicleRepairHistoryOptions,
  vehicleRepairHistoryRows,
} from "../src/vehicle-repair-history.mjs";

const requests = [
  {ref: "REQ-1", door: " V-173 ", start: "2026-08-01 09:00", closedAt: "2026-08-01 12:00", status: "Closed", maintenanceWork: "Changed hose"},
  {ref: "REQ-2", door: "v-173", start: "2026-09-01 09:00", status: "In progress", maintenanceWork: ""},
  {ref: "REQ-3", door: "V-173", start: "2026-09-10 09:00", closedAt: "2026-09-10 15:00", status: "Closed", maintenanceWork: "Replaced seal"},
  {ref: "REQ-4", door: "EX-20", start: "2026-09-11 09:00", status: "Closed", maintenanceWork: "Serviced"},
];

test("vehicle repair history groups normalized door numbers and sorts newest first", () => {
  assert.equal(vehicleHistoryKey(requests[0]), "door:v-173");
  assert.deepEqual(vehicleRepairHistoryRows(requests, requests[0]).map((row) => row.ref), ["REQ-3", "REQ-2", "REQ-1"]);
  assert.equal(latestCompletedVehicleRepair(requests, requests[0]).ref, "REQ-3");
});

test("vehicle repair history options contain each vehicle once", () => {
  assert.deepEqual(vehicleRepairHistoryOptions(requests).map((option) => option.door), ["EX-20", "V-173"]);
});
