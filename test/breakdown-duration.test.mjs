import assert from "node:assert/strict";
import test from "node:test";

import { calculateBreakdownDays } from "../breakdown-duration.mjs";

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
