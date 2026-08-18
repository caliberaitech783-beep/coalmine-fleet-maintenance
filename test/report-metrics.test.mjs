import test from "node:test";
import assert from "node:assert/strict";
import {elapsedLabel, elapsedMilliseconds, latestTimestamp, parseReportTimestamp} from "../report-metrics.mjs";

test("parses persisted and optimistic India timestamps", () => {
  assert.equal(parseReportTimestamp("2026-08-18 10:15")?.toISOString(), "2026-08-18T04:45:00.000Z");
  assert.equal(parseReportTimestamp("2026-08-18 · 10:15:30")?.toISOString(), "2026-08-18T04:45:30.000Z");
});

test("calculates elapsed time between workflow events", () => {
  assert.equal(elapsedMilliseconds("2026-08-18 10:00", "2026-08-19 12:35"), 26 * 60 * 60 * 1000 + 35 * 60 * 1000);
  assert.equal(elapsedLabel("2026-08-18 10:00", "2026-08-19 12:35"), "1d 2h 35m");
  assert.equal(elapsedLabel("2026-08-18 10:00", "2026-08-18 10:45"), "45m");
});

test("missing, invalid, and reversed timestamps are safe", () => {
  assert.equal(elapsedLabel("", "2026-08-19 12:35"), "—");
  assert.equal(elapsedLabel("not a date", "2026-08-19 12:35"), "—");
  assert.equal(elapsedLabel("2026-08-19 12:35", "2026-08-18 12:35"), "0m");
});

test("latestTimestamp returns the newest valid event", () => {
  assert.equal(latestTimestamp(["2026-08-18 12:00", "2026-08-19 09:30", "bad"]), "2026-08-19 09:30");
  assert.equal(latestTimestamp([]), "—");
});
