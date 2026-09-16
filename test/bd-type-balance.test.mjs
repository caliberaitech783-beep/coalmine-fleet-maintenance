import test from "node:test";
import assert from "node:assert/strict";
import { breakdownTypeShare } from "../dashboard-breakdown-movement.mjs";
import { movementRequestRows } from "../src/dashboard-card-actions.mjs";

test("BD type mix uses open balance, including carryover and excluding closed and idle", () => {
  const counts = { Breakdown: 52, Accidental: 4, Preventive: 10, "Aggregate Repair": 1, "Super Structure": 1, WGM: 5 };
  const rows = Object.entries(counts).flatMap(([category, count]) => Array.from({ length: count }, (_, index) => ({
    ref: `${category}-${index}`, category, status: "Open", start: "2026-09-01",
  })));
  rows.push({ category: "Breakdown", status: "Closed", start: "2026-09-16", closedAt: "2026-09-16" });
  rows.push({ category: "Breakdown", status: "Idle", start: "2026-09-01" });
  rows.push({ category: "WGM", status: "Ideal", start: "2026-09-16" });
  const balance = movementRequestRows(rows, "2026-09-16", "2026-09-16", "active-balance");
  assert.equal(balance.length, 73);
  const mix = breakdownTypeShare(balance);
  for (const item of mix) {
    assert.equal(item.count, counts[item.label]);
    assert.equal(item.percentage, Math.round(counts[item.label] / 73 * 100));
  }
  assert.ok(breakdownTypeShare([]).every(item => item.count === 0 && item.percentage === 0));
});
