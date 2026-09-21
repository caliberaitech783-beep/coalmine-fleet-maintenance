import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("maintenance door numbers open a vehicle-specific repair history page", () => {
  assert.match(source, /className="vehicle-history-link"/);
  assert.match(source, /onVehicleHistory=\{setVehicleHistoryTarget\}/);
  assert.match(source, /What was done last time/);
  assert.match(source, /<VehicleRepairHistoryPage vehicle=\{vehicleHistoryTarget\} rows=\{requestRows\}/);
});

test("maintenance reports include selectable and downloadable vehicle repair history", () => {
  assert.match(source, /title: VEHICLE_REPAIR_HISTORY_REPORT/);
  assert.match(source, /vehicleHistoryReportRows/);
  assert.match(source, /setVehicleHistorySelection/);
  assert.match(source, /setReportVehicleHistoryTarget\(request\)/);
  assert.match(source, /backLabel="Back to reports"/);
  assert.match(source, /label="Generate"/);
  assert.match(source, /label="Download history"/);
  assert.match(source, /label: "Work completed"/);
});
