import test from "node:test";
import assert from "node:assert/strict";
import { dateKeyOf, describeDateRange, encodeDateRange, looksLikeDateColumn, matchesDateRange, parseDateRange } from "../src/date-range-filter.mjs";

test("date ranges round-trip through the single-string column filter value", () => {
  assert.equal(encodeDateRange("", ""), "");
  assert.deepEqual(parseDateRange(encodeDateRange("2026-09-01", "2026-09-10")), { from: "2026-09-01", to: "2026-09-10" });
  assert.deepEqual(parseDateRange(encodeDateRange("2026-09-01", "")), { from: "2026-09-01", to: "" });
  assert.equal(parseDateRange("Open"), null);
  assert.equal(describeDateRange({ from: "2026-09-01", to: "" }), "Date range 01-09-2026 to …");
});

test("raw and displayed date-times resolve to the same day and match inclusive ranges", () => {
  assert.equal(dateKeyOf("2026-09-10 15:52:08"), "2026-09-10");
  assert.equal(dateKeyOf("10-09-2026 03:52:08 PM"), "2026-09-10");
  assert.equal(dateKeyOf("9-9-2026"), "2026-09-09");
  assert.equal(dateKeyOf("V520-95008"), "");
  const range = { from: "2026-09-09", to: "2026-09-10" };
  assert.ok(matchesDateRange("09-09-2026 10:15:29 AM", range));
  assert.ok(matchesDateRange("2026-09-10 23:59:00", range));
  assert.ok(!matchesDateRange("11-09-2026 12:00:00 AM", range));
  assert.ok(!matchesDateRange("—", range));
  assert.ok(matchesDateRange("2026-09-30", { from: "2026-09-09", to: "" }), "open-ended ranges only bound one side");
});

test("only columns whose recorded values are all dates offer the calendar", () => {
  assert.ok(looksLikeDateColumn(["10-09-2026 03:52:08 PM", "—", "09-09-2026 10:15:29 AM"]));
  assert.ok(!looksLikeDateColumn(["0d 0h 4m", "0d 0h 13m"]));
  assert.ok(!looksLikeDateColumn(["E09-MH34BZ2413", "10-09-2026 03:52:08 PM"]));
  assert.ok(!looksLikeDateColumn(["—", ""]));
});
