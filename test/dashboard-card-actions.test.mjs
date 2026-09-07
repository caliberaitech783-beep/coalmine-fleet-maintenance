import assert from "node:assert/strict";
import test from "node:test";
import { dashboardListTrigger, movementRequestRows, allLifecycleRequestRows, recordedTrendRows, forecastBasisRows } from "../src/dashboard-card-actions.mjs";
import { breakdownMovementForRange, breakdownTypeShare } from "../dashboard-breakdown-movement.mjs";

test("card background opens once without replacing a nested chart or control action", () => {
  const opened = [];
  const card = { contains: () => true };
  const nested = {};
  const action = dashboardListTrigger((key) => opened.push(key), "all", "All records");
  const event = (owner = card, control = null) => ({ currentTarget: card, target: { closest: (selector) => selector === "[data-dashboard-list]" ? owner : control }, stopPropagation() { this.stopped = true; } });
  const background = event();
  action.onClick(background);
  assert.deepEqual(opened, ["all"]);
  assert.equal(background.stopped, true);
  action.onClick(event(nested));
  // A button, SVG in a button, date input, or label keeps its own action.
  action.onClick(event(card, nested));
  action.onClick({ ...event(), defaultPrevented: true });
  assert.deepEqual(opened, ["all"]);
});

test("keyboard activation stays on the focused card and loading cards do not open", () => {
  const opened = [];
  const action = dashboardListTrigger((key) => opened.push(key), "all", "All records");
  const card = {};
  for (const key of ["Enter", " "]) {
    const event = { key, target: card, currentTarget: card, preventDefault() { this.prevented = true; }, stopPropagation() {} };
    action.onKeyDown(event);
    assert.equal(event.prevented, true);
  }
  action.onKeyDown({ key: "Enter", target: {}, currentTarget: card });
  action.onKeyDown({ key: "ArrowRight", target: card, currentTarget: card });
  dashboardListTrigger((key) => opened.push(key), "all", "All records", false).onClick({});
  assert.deepEqual(opened, ["all", "all"]);
});

test("chart column whitespace opens the full list while its bar opens the chosen day", () => {
  const opened = [], surface = { contains: () => true };
  const action = dashboardListTrigger((key) => opened.push(key), "trend:actual:2026-09-04", "Selected day", true, "button", { selector: "i, b, small", backgroundKey: "trend:all" });
  const event = (onBar) => ({ currentTarget: surface, target: { closest: (selector) => selector === "i, b, small" ? (onBar ? {} : null) : surface }, stopPropagation() {} });
  action.onClick(event(false));
  action.onClick(event(true));
  assert.deepEqual(opened, ["trend:all", "trend:actual:2026-09-04"]);
});

const records = [
  { id: 1, start: "2026-09-01", status: "Open", category: "Breakdown" },
  { id: 2, start: "2026-09-02", closedAt: "2026-09-04", status: "Closed", category: "Preventive" },
  { id: 3, startedAt: "2026-09-03", status: "In Progress", category: "Accident" },
  { id: 4, createdAt: "2026-09-04", closedAt: "2026-09-04", status: "Closed", category: "PM" },
  { id: 5, start: "2026-08-01", closedAt: "2026-09-02", status: "Closed" },
  { id: 6, start: "2026-09-05", status: "Open" },
  { id: 7, status: "Open" },
];
const ids = (rows) => rows.map(({ id }) => id);

test("BD summaries open the records counted at the range boundaries", () => {
  const totals = breakdownMovementForRange(records, "2026-09-03", "2026-09-04");
  const expected = { open: [1, 2], incoming: [3, 4], outgoing: [2, 4], balance: [1, 3] };
  for (const [metric, expectedIds] of Object.entries(expected)) {
    const result = movementRequestRows(records, "2026-09-03", "2026-09-04", metric);
    assert.deepEqual(ids(result), expectedIds);
    assert.equal(result.length, totals[metric]);
  }
  assert.deepEqual(ids(movementRequestRows(records, "2026-09-03", "2026-09-04")), [1, 2, 3, 4]);
  assert.deepEqual(movementRequestRows(records, "2026-09-05", "2026-09-04"), []);
});

test("type mix details match period intake and normalized repair types", () => {
  const mix = breakdownTypeShare(records, "2026-09-03", "2026-09-04");
  for (const type of mix) {
    assert.equal(movementRequestRows(records, "2026-09-03", "2026-09-04", "incoming", type.label).length, type.count);
  }
  assert.deepEqual(ids(movementRequestRows(records, "2026-09-03", "2026-09-04", "incoming", "Preventive")), [4]);
});

test("full lifecycle list includes each request once, matching the chosen event date", () => {
  const events = { opened: [records[0], records[1]], closed: [records[1], records[3]], verified: [records[3]], idle: [] };
  const dateOf = (record, event) => event === "opened" ? record.start : record.closedAt;
  assert.deepEqual(ids(allLifecycleRequestRows(events, dateOf)), [1, 2, 4]);
  assert.deepEqual(ids(allLifecycleRequestRows(events, dateOf, "2026-09-04")), [2, 4]);
  assert.deepEqual(allLifecycleRequestRows(events, dateOf, "2026-09-07"), []);
});

test("trend full list retains the displayed period; a selected date narrows it", () => {
  const days = [{ date: "2026-09-01", kind: "actual" }, { date: "2026-09-02", kind: "actual" }, { date: "2026-09-05", kind: "forecast" }];
  assert.deepEqual(ids(recordedTrendRows(records, days, (record) => record.start)), [1, 2]);
  assert.deepEqual(ids(recordedTrendRows(records, days, (record) => record.start, "2026-09-02")), [2]);
  assert.deepEqual(recordedTrendRows(records, days, (record) => record.start, "2026-09-05"), []);
});

test("forecast support contains the 56-day history, not future request records", () => {
  const rows = [{ start: "2026-07-13" }, { start: "2026-07-14" }, { start: "2026-09-07" }, { start: "2026-09-08" }];
  assert.deepEqual(forecastBasisRows(rows, "2026-09-07", (record) => record.start), rows.slice(1, 3));
});
