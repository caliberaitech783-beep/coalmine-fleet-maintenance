import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateBreakdownDays,
  calculateBreakdownDaysFromStart,
  formatBreakdownDaysHours,
} from "../breakdown-duration.mjs";

test("a breakdown started today shows zero completed days", () => {
  assert.equal(
    calculateBreakdownDays("2026-08-13", "12:00:00", new Date("2026-08-13T10:00:00.000Z")),
    0,
  );
});

test("breakdown days use completed 24-hour periods in India time", () => {
  const now = new Date("2026-08-13T10:00:00.000Z");

  assert.equal(calculateBreakdownDays("2026-08-12", "15:30:00", now), 1);
  assert.equal(calculateBreakdownDays("2026-08-10", "09:30:00", now), 3);
});

test("future and invalid breakdown dates safely show zero days", () => {
  const now = new Date("2026-08-13T10:00:00.000Z");

  assert.equal(calculateBreakdownDays("2026-08-14", "15:30:00", now), 0);
  assert.equal(calculateBreakdownDays("2026-02-30", "15:30:00", now), 0);
  assert.equal(calculateBreakdownDays("2026-08-12", "25:00:00", now), 0);
});

test("request start values support saved and newly submitted formats", () => {
  const now = new Date("2026-08-13T10:00:00.000Z");

  assert.equal(calculateBreakdownDaysFromStart("2026-08-12 15:30", now), 1);
  assert.equal(calculateBreakdownDaysFromStart("2026-08-10 · 09:30:00", now), 3);
  assert.equal(calculateBreakdownDaysFromStart("Not available", now), 0);
});

test("days of breakdown show completed days and hours until closure or now", () => {
  const now = new Date("2026-09-10T07:00:00.000Z"); // 12:30 IST

  assert.equal(formatBreakdownDaysHours("2026-09-10 · 09:00:00", "—", now), "0d 3h");
  assert.equal(formatBreakdownDaysHours("2026-09-07 10:15", undefined, now), "3d 2h");
  assert.equal(formatBreakdownDaysHours("2026-09-05 09:00:00", "2026-09-09 08:00:00", now), "3d 23h");
  assert.equal(formatBreakdownDaysHours("2026-09-11 09:00:00", "—", now), "0d 0h");
  assert.equal(formatBreakdownDaysHours("Not available", "—", now), "—");
});
