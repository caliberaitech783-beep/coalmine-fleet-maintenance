import assert from "node:assert/strict";
import test from "node:test";
import { dashboardCountScale } from "../src/dashboard-count-scale.mjs";

test("fleet and lifecycle counts use readable, equally spaced whole-count intervals", () => {
  assert.deepEqual(dashboardCountScale([48, 142, 49, 208]), { maximum: 250, ticks: [0, 50, 100, 150, 200, 250] });
  assert.deepEqual(dashboardCountScale([23, 20, 15, 75]), { maximum: 100, ticks: [0, 20, 40, 60, 80, 100] });
});

test("empty and small datasets retain a valid zero-based count scale", () => {
  for (const values of [[], [0, 0], [1, 2, 3]]) {
    assert.deepEqual(dashboardCountScale(values), { maximum: 5, ticks: [0, 1, 2, 3, 4, 5] });
  }
});

test("scale covers changing ranges without clipping or fractional grid counts", () => {
  for (const peak of [1, 4, 5, 6, 11, 13, 26, 51, 76, 126, 208, 501, 1125, 5001]) {
    const { maximum, ticks } = dashboardCountScale([0, 1, peak]);
    assert.ok(maximum >= peak);
    assert.equal(ticks[0], 0);
    assert.equal(ticks.at(-1), maximum);
    assert.ok(ticks.every(Number.isInteger));
    assert.ok(ticks.slice(1).every((tick, index) => tick - ticks[index] === maximum / 5));
  }
});
