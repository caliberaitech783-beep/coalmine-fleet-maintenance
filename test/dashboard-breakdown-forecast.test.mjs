import assert from "node:assert/strict";
import test from "node:test";
import { buildBreakdownTrend, buildRecordedBreakdownTrend, recordedBreakdownRangeLength } from "../src/dashboard-breakdown-forecast.mjs";

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

test("custom recorded ranges include both dates, zero days and periods beyond preset lengths", () => {
  const counts = {"2026-08-01": 2, "2026-09-09": 3, "2026-09-10": 90};
  const days = buildRecordedBreakdownTrend({counts, startDate: "2026-08-01", endDate: "2026-09-09"});
  assert.equal(days.length, 40);
  assert.equal(days[0].date, "2026-08-01");
  assert.deepEqual(days.at(-1), {date: "2026-09-09", count: 3, kind: "actual", anchor: true});
  assert.equal(days.reduce((sum, day) => sum + day.count, 0), 5);
  assert.equal(days.filter((day) => day.count === 0).length, 38);
  assert.equal(buildRecordedBreakdownTrend({counts, startDate: "2026-09-09", endDate: "2026-09-09"}).length, 1);
  assert.equal(recordedBreakdownRangeLength("2024-02-28", "2024-03-01"), 3);
  assert.equal(recordedBreakdownRangeLength("2026-12-31", "2027-01-01"), 2);
});

test("invalid or extreme recorded date ranges do not fall back to unrelated preset data", () => {
  for (const [startDate, endDate] of [["", "2026-09-09"], ["2026-09-10", "2026-09-09"], ["2026-02-30", "2026-03-01"], ["bad", "bad"], ["0002-01-01", "2026-09-09"]]) {
    assert.deepEqual(buildRecordedBreakdownTrend({startDate, endDate}), []);
  }
});
