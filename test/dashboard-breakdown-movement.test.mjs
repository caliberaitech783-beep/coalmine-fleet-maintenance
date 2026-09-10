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

test("empty dates include the full history and legacy undated requests", () => {
  assert.deepEqual(breakdownMovementForRange([
    ...records,
    { start: "2024-01-01", closedAt: "2024-01-02", status: "Closed" },
    { status: "Open" },
    { status: "Closed" },
  ]), { open: 0, incoming: 7, outgoing: 4, balance: 3 });
  assert.deepEqual(breakdownMovementForRange([]), { open: 0, incoming: 0, outgoing: 0, balance: 0 });
  const types = breakdownTypeShare([{ start: "2024-01-01", category: "PM" }, { category: "Breakdown" }]);
  assert.equal(types.find(({label}) => label === "Preventive").percentage, 50);
  assert.equal(types.find(({label}) => label === "Breakdown").count, 1);
});

test("day-wise full history does not silently stop after one year", () => {
  const days = dailyBreakdownMovement([{ start: "2025-02-01", status: "Open" }], "2024-01-01", "2025-02-01");
  assert.equal(days.length, 398);
  assert.deepEqual(days.at(-1), { date: "2025-02-01", open: 0, incoming: 1, outgoing: 0, balance: 1 });
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
