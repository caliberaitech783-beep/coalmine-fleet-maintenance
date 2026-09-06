import assert from "node:assert/strict";
import test from "node:test";
import { BREAKDOWN_TYPE_LABELS, breakdownMovementForRange, breakdownTypeShare, dailyBreakdownMovement } from "../dashboard-breakdown-movement.mjs";

const records = [
  { start: "2026-09-01 08:00:00", status: "Open" },
  { start: "2026-09-02 09:00:00", closedAt: "2026-09-04 18:00:00", status: "Closed" },
  { startedAt: "2026-09-03 10:00:00", status: "In Progress" },
  { createdAt: "2026-09-04 11:00:00", closedAt: "2026-09-04 17:00:00", status: "Closed" },
];

test("breakdown movement reconciles opening, inward, outward and balance", () => {
  assert.deepEqual(breakdownMovementForRange(records, "2026-09-03", "2026-09-04"), {
    open: 2,
    incoming: 2,
    outgoing: 2,
    balance: 2,
  });
});

test("day-wise movement reports each date independently", () => {
  assert.deepEqual(dailyBreakdownMovement(records, "2026-09-03", "2026-09-04"), [
    { date: "2026-09-03", open: 2, incoming: 1, outgoing: 0, balance: 3 },
    { date: "2026-09-04", open: 3, incoming: 1, outgoing: 2, balance: 2 },
  ]);
});

test("invalid ranges return an empty result", () => {
  assert.deepEqual(breakdownMovementForRange(records, "2026-09-05", "2026-09-04"), { open: 0, incoming: 0, outgoing: 0, balance: 0 });
  assert.deepEqual(dailyBreakdownMovement(records, "", "2026-09-04"), []);
});

test("breakdown type share defines all six types as a percentage of period intake", () => {
  const rows = [
    { start: "2026-09-01", category: "Breakdown" },
    { start: "2026-09-02", category: "breakdown" },
    { start: "2026-09-03", category: "Accident" },
    { start: "2026-09-04", category: "Preventive" },
  ];
  const result = breakdownTypeShare(rows, "2026-09-01", "2026-09-05");
  assert.deepEqual(result.map(({ label }) => label), BREAKDOWN_TYPE_LABELS);
  assert.deepEqual(result.slice(0, 3), [
    { label: "Breakdown", count: 2, percentage: 50 },
    { label: "Accidental", count: 1, percentage: 25 },
    { label: "Preventive", count: 1, percentage: 25 },
  ]);
});
