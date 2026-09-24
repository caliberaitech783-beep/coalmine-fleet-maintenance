import test from "node:test";
import assert from "node:assert/strict";
import {
  latestCompletedVehicleRepair,
  vehicleBreakdownHistoryRows,
  vehicleBreakdownSummaryRows,
  vehicleCommonRemarkRows,
  vehicleFleetRows,
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

test("vehicle breakdown history is chronological and measures each repeat from the previous breakdown", () => {
  const rows = vehicleBreakdownHistoryRows(requests, requests[0]);
  assert.deepEqual(rows.map((row) => row.ref), ["REQ-1", "REQ-2", "REQ-3"]);
  assert.equal(rows[0].timeSincePreviousBreakdown, "");
  assert.equal(rows[1].timeSincePreviousBreakdown, "31 days");
  assert.equal(rows[2].timeSincePreviousBreakdown, "9 days");
});

test("fleet, month ranking, and common remarks aggregate each vehicle without losing request detail", () => {
  const detailed = [
    {...requests[0], driverName: "Asha", complaint: "Hydraulic leak", site: "Sasti OB", dailyRemarks: [{remark: "Hose ordered"}]},
    {...requests[1], driverName: "Ravi", complaint: "Hydraulic leak", site: "Sasti OB"},
    {...requests[2], driverName: "Ravi", complaint: "Brake issue", site: "Sasti OB"},
    requests[3],
  ];
  const fleet = vehicleFleetRows([{door: "V-173", make: "Tata", model: "Prima", currentLocation: "Sasti OB"}], detailed);
  assert.equal(fleet.find((row) => row.reportDoor === "V-173").breakdownCount, 3);
  const monthly = vehicleBreakdownSummaryRows(detailed, {month: "2026-09", site: "Sasti OB"});
  assert.equal(monthly[0].breakdownCount, 2);
  assert.equal(monthly[0].breakdowns.length, 2);
  const remarks = vehicleCommonRemarkRows([], detailed);
  assert.equal(remarks.find((row) => row.reportDoor === "V-173").breakdownReason, "Hydraulic leak");
});
