import test from "node:test";
import assert from "node:assert/strict";
import { hourlyBreakdownEvents } from "../src/hourly-breakdown.mjs";

test("rolling windows include recent entries and exits independently with IST timestamps", () => {
  const now = Date.parse("2026-09-11T12:00:00+05:30");
  const rows = [
    { ref: "A", site: "Sasti OB", door: "V1", start: "2026-09-11 11:00:00", closedAt: "2026-09-11 11:30:00" },
    { ref: "B", start: "2026-09-11 10:59:59" },
    { ref: "C", start: "2026-09-11 12:00:01" },
    { ref: "D", start: "invalid" },
  ];
  assert.deepEqual(hourlyBreakdownEvents(rows, 1, now).map(row => row.direction), ["Out", "In"]);
  assert.equal(hourlyBreakdownEvents(rows, 2, now).length, 3);
  assert.equal(hourlyBreakdownEvents(rows, 10, now).length, 3);
  assert.equal(hourlyBreakdownEvents(rows, 11, now).length, 0);
  assert.equal(hourlyBreakdownEvents(rows, 1, now)[0].door, "V1");
});
