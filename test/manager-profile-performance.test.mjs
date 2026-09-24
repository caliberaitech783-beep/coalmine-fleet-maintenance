import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { liveEquipmentMetrics, liveEquipmentRoadStatuses } from "../dashboard-equipment-metrics.mjs";
import { requestWithEquipmentMasterDetails } from "../request-equipment.mjs";

test("a 2,500-row manager profile prepares fleet and request data without a quadratic scan", () => {
  const equipment = Array.from({length: 2500}, (_, index) => ({
    manufacturerSerialNo: `SN-${index}`,
    door: `D-${index}`,
    equipmentName: `Asset ${index}`,
    currentLocation: "Sasti OB",
    make: "Test make",
    model: "Test model",
  }));
  const requests = Array.from({length: 2500}, (_, index) => ({
    ref: `REQ-${index}`,
    chassis: `SN-${index}`,
    door: `D-${index}`,
    site: "Sasti OB",
    status: index % 2 ? "Open" : "Closed",
  }));

  const startedAt = performance.now();
  const enriched = requests.map((request) => requestWithEquipmentMasterDetails(request, equipment));
  const statuses = liveEquipmentRoadStatuses(equipment, enriched);
  const metrics = liveEquipmentMetrics(equipment, enriched, statuses);
  const elapsed = performance.now() - startedAt;

  assert.deepEqual(metrics, {total: 2500, onRoad: 1250, offRoad: 1250, idle: 0, unknown: 0, availability: 50});
  assert.ok(elapsed < 5000, `manager profile preparation took ${elapsed.toFixed(1)}ms`);
});

test("large table export cells are prepared only after an export action", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const exportMenu = source.slice(source.indexOf("function ExportMenu("), source.indexOf("function ReportColumnSelector("));
  assert.match(exportMenu, /const buildExportRows = \(\) => rows\.map/);
  assert.doesNotMatch(exportMenu, /const exportRows = rows\.map/);
});
