import assert from "node:assert/strict";
import test from "node:test";
import { buildBreakdownTrend } from "../dashboard-breakdown-forecast.mjs";

test("breakdown trend separates recorded history from future forecasts", () => {
  const counts = {
    "2026-08-24": 7,
    "2026-08-31": 9,
    "2026-09-01": 4,
    "2026-09-02": 6,
  };
  const series = buildBreakdownTrend({ counts, anchorDate: "2026-09-02", days: 7, view: "both" });
  assert.equal(series.length, 14);
  assert.equal(series.filter((day) => day.kind === "actual").length, 7);
  assert.equal(series.filter((day) => day.kind === "forecast").length, 7);
  assert.deepEqual(series.find((day) => day.anchor), { date: "2026-09-02", count: 6, kind: "actual", anchor: true });
  assert.ok(series.filter((day) => day.kind === "forecast").every((day) => Number.isInteger(day.count) && day.count >= 0));
});

test("past and upcoming filters return only their selected side", () => {
  const counts = { "2026-09-02": 3 };
  const past = buildBreakdownTrend({ counts, anchorDate: "2026-09-02", days: 14, view: "past" });
  const upcoming = buildBreakdownTrend({ counts, anchorDate: "2026-09-02", days: 30, view: "upcoming" });
  assert.equal(past.length, 14);
  assert.ok(past.every((day) => day.kind === "actual"));
  assert.equal(upcoming.length, 30);
  assert.ok(upcoming.every((day) => day.kind === "forecast"));
});
