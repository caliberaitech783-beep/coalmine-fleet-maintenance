import test from "node:test";
import assert from "node:assert/strict";
import { equipmentMetrics } from "../dashboard-equipment-metrics.mjs";

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
