import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const dashboardSource = fs.readFileSync(new URL("../src/dashboard-record-browser.jsx", import.meta.url), "utf8");
const hourlySource = fs.readFileSync(new URL("../src/hourly-breakdown-view.jsx", import.meta.url), "utf8");

test("door numbers open a vehicle-specific repair history page", () => {
  assert.match(source, /className="vehicle-history-link"/);
  assert.match(source, /onVehicleHistory=\{setVehicleHistoryTarget\}/);
  assert.match(source, /VEHICLE_HISTORY_OPEN_EVENT/);
  assert.match(source, /globalVehicleHistoryDialog/);
  assert.match(source, /What was done last time/);
  assert.match(source, /<VehicleRepairHistoryPage vehicle=\{vehicleHistoryTarget\} rows=\{requestRows\}/);
});

test("shared workflow, master, dashboard, and hourly tables use the vehicle history door action", () => {
  assert.match(source, /case "door": return <td>\{r\.door \? <a[^>]+className="vehicle-history-link"/);
  assert.match(source, /if \(onVehicleHistory\) onVehicleHistory\(row\); else openVehicleRepairHistory\(row\)/);
  assert.match(source, /aria-label=\{`View repair history for door number \$\{v\.door\}`\}/);
  assert.match(source, /aria-label=\{`View repair history for door number \$\{request\.door\}`\}/);
  assert.match(dashboardSource, /window\.dispatchEvent\(new CustomEvent\("nerve-center:open-vehicle-history"/);
  assert.match(hourlySource, /window\.dispatchEvent\(new CustomEvent\("nerve-center:open-vehicle-history"/);
});

test("reports include a dedicated vehicle history category with three downloadable sub-reports", () => {
  assert.match(source, /id: "vehicle-history", label: "Vehicle History Report"/);
  assert.match(source, /title: VEHICLE_HISTORY_REPORT/);
  assert.match(source, /title: MAXIMUM_VEHICLE_BREAKDOWN_REPORT/);
  assert.match(source, /title: VEHICLE_COMMON_REMARK_REPORT/);
  assert.match(source, /vehicleHistoryReportRows/);
  assert.match(source, /setBreakdownMonth/);
  assert.match(source, /setBreakdownRegion/);
  assert.match(source, /setBreakdownSite/);
  assert.match(source, /column\.key === "door"/);
  assert.match(source, /setReportVehicleHistoryTarget\(record\)/);
  assert.match(source, /backLabel="Back to reports"/);
  assert.match(source, /label="Generate"/);
  assert.match(source, /label="Download history"/);
  assert.match(source, /label: "Work completed"/);
  assert.match(source, /label: "Time since previous breakdown"/);
  assert.match(source, /RequestProcessModal/);
});
