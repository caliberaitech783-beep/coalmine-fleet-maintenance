import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateBreakdownDays,
  calculateBreakdownDaysFromStart,
  calculateBreakdownDaysUntilClose,
  calculateBreakdownMinutes,
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

test("days of breakdown show completed days, hours and minutes until closure or now", () => {
  const now = new Date("2026-09-10T07:00:00.000Z"); // 12:30 IST

  assert.equal(formatBreakdownDaysHours("2026-09-10 · 09:00:00", "—", now), "0d 3h 30m");
  assert.equal(formatBreakdownDaysHours("2026-09-07 10:15", undefined, now), "3d 2h 15m");
  assert.equal(formatBreakdownDaysHours("2026-09-05 09:00:00", "2026-09-09 08:00:00", now), "3d 23h 0m");
  assert.equal(formatBreakdownDaysHours("2026-09-11 09:00:00", "—", now), "0d 0h 0m");
  assert.equal(formatBreakdownDaysHours("Not available", "—", now), "—");
});

test("breakdown minutes give a numeric sort value, with unknown starts first", () => {
  const now = new Date("2026-09-10T07:00:00.000Z"); // 12:30 IST

  assert.equal(calculateBreakdownMinutes("2026-09-10 · 09:00:00", "—", now), 210);
  assert.equal(calculateBreakdownMinutes("2026-09-05 09:00:00", "2026-09-09 08:00:00", now), 5700);
  assert.equal(calculateBreakdownMinutes("Not available", "—", now), -1);
});

test("closed MIS requests display the same breakdown duration used by high-to-low sorting", () => {
  const now = new Date("2026-09-19T12:02:00.000Z");
  const requests = [
    { start: "2026-09-14 09:30:20", closedAt: "2026-09-18 14:35:02" },
    { start: "2026-09-16 09:58:17", closedAt: "2026-09-19 15:15:54" },
    { start: "2026-09-16 09:04:37", closedAt: "2026-09-18 16:09:44" },
    { start: "2026-09-15 15:51:34", closedAt: "2026-09-17 18:51:23" },
    { start: "2026-09-16 10:26:18", closedAt: "2026-09-18 12:44:51" },
  ];
  const sorted = [...requests].sort((a, b) =>
    calculateBreakdownMinutes(b.start, b.closedAt, now) - calculateBreakdownMinutes(a.start, a.closedAt, now),
  );
  assert.deepEqual(sorted.map((row) => calculateBreakdownDaysUntilClose(row.start, row.closedAt, now)), [4, 3, 2, 2, 2]);
  assert.equal(calculateBreakdownDaysUntilClose(requests[0].start, requests[0].closedAt, new Date("2026-09-25T12:02:00.000Z")), 4);
  assert.equal(calculateBreakdownDaysUntilClose("2026-09-16 09:04:37", "", now), 3);
});

test("duration labels convert to minutes for sorting, with dashes first", async () => {
  const {durationLabelMinutes} = await import("../breakdown-duration.mjs");

  assert.equal(durationLabelMinutes("3d 2h 15m"), 4455);
  assert.equal(durationLabelMinutes("0h 27m"), 27);
  assert.equal(durationLabelMinutes("45m"), 45);
  assert.equal(durationLabelMinutes("—"), -1);
  assert.equal(durationLabelMinutes(""), -1);
});
