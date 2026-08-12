import assert from "node:assert/strict";
import test from "node:test";

import {
  isValidTime24,
  parseIndiaRequestDateTime,
  TIME_24H_PATTERN,
} from "../request-time.mjs";

test("the browser time pattern accepts valid manual HH:MM:SS values", () => {
  const browserPattern = new RegExp(`^(?:${TIME_24H_PATTERN})$`);

  assert.equal(browserPattern.test("00:00:00"), true);
  assert.equal(browserPattern.test("17:54:43"), true);
  assert.equal(browserPattern.test("23:59:59"), true);
  assert.equal(isValidTime24("24:00:00"), false);
  assert.equal(isValidTime24("17:54"), false);
});

test("a manually entered India time is stored as the same India wall time", () => {
  const parsed = parseIndiaRequestDateTime("2026-08-11 · 17:54:43");

  assert.equal(parsed.toISOString(), "2026-08-11T12:24:43.000Z");
});

test("an invalid request time uses the supplied fallback", () => {
  const fallback = new Date("2026-01-01T00:00:00.000Z");

  assert.equal(parseIndiaRequestDateTime("2026-08-11 · 25:00:00", fallback), fallback);
});
