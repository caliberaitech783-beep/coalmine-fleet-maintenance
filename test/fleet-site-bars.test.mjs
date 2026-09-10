import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { transformWithOxc } from "vite";
import { fleetChartCounts } from "../dashboard-equipment-metrics.mjs";
import { fleetBarHeightPercent } from "../src/fleet-bar-scale.mjs";

const source = readFileSync(new URL("../src/fleet-site-bars.jsx", import.meta.url), "utf8")
  .replace('import React from "react";', "")
  .replace('import { fleetBarHeightPercent } from "./fleet-bar-scale.mjs";', "")
  .replace("export default function FleetSiteBars", "function FleetSiteBars");
const code = (await transformWithOxc(source, "fleet-site-bars.jsx", { jsx: { runtime: "classic" } })).code;
const FleetSiteBars = new Function("React", "fleetBarHeightPercent", `${code}; return FleetSiteBars;`)(React, fleetBarHeightPercent);
const all = (tree, predicate) => {
  const result = [];
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!React.isValidElement(node)) return;
    if (predicate(node)) result.push(node);
    visit(node.props.children);
  };
  visit(tree);
  return result;
};

test("physical asset chart segments count repeated requests once and keep Idle out of breakdown", () => {
  const records = [{ door: "A", category: "Vehicle" }, { door: "B", category: "Vehicle" }, { door: "C", category: "Equipment" }];
  const requests = [{ door: "A", status: "Open" }, { door: "A", status: "Awaiting parts" }, { door: "B", status: "Idle" }, { door: "C", status: "Closed" }];
  const site = fleetChartCounts(records, requests);
  const tree = FleetSiteBars({ site, axisMax: 10, showBreakdown: true });
  const bars = all(tree, (node) => node.type === "i");
  assert.equal(bars[1].props.title, "Vehicles: 2 total, 1 breakdown, 1 remaining");
  const segments = all(tree, (node) => node.props.className?.startsWith("mine-fleet-breakdown-segment"));
  assert.equal(segments.length, 1);
  assert.equal(segments[0].props.style.height, "50%");
});

test("legacy case counts cannot overflow asset bars or produce negative remaining labels", () => {
  const tree = FleetSiteBars({ site: { equipment: 0, vehicles: 1, breakdown: { equipment: 3, vehicles: 5 } }, axisMax: 0, showBreakdown: true });
  const bars = all(tree, (node) => node.type === "i");
  assert.equal(bars[0].props.title, "Equipment: 0 total, 0 breakdown, 0 remaining");
  assert.equal(bars[1].props.title, "Vehicles: 1 total, 1 breakdown, 0 remaining");
  for (const node of all(tree, (node) => node.props.style?.height)) {
    const height = Number.parseFloat(node.props.style.height);
    assert.ok(Number.isFinite(height) && height >= 0 && height <= 100);
  }
});

test("empty, non-finite and negative chart inputs never render invalid dimensions", () => {
  for (const site of [undefined, {}, { equipment: -1, vehicles: Infinity, breakdown: { equipment: -9, vehicles: NaN } }]) {
    const tree = FleetSiteBars({ site, axisMax: NaN, showBreakdown: true });
    for (const node of all(tree, (node) => node.props.style?.height)) assert.equal(node.props.style.height, "0%");
    assert.equal(all(tree, (node) => node.props.className?.startsWith("mine-fleet-breakdown-segment")).length, 0);
  }
});

test("partial breakdown segments are marked so the remaining fleet stays visible", () => {
  const tree = FleetSiteBars({ site: { equipment: 31, vehicles: 12, breakdown: { equipment: 3, vehicles: 12 } }, axisMax: 225, showBreakdown: true });
  const segments = all(tree, (node) => node.props.className?.startsWith("mine-fleet-breakdown-segment"));
  assert.equal(segments.length, 2);
  assert.ok(segments[0].props.className.includes("partial-segment"));
  assert.ok(!segments[1].props.className.includes("partial-segment"));
});

test("bars and green segments are exactly proportional on one linear scale", () => {
  const axisMax = 225;
  const render = (total, count) => {
    const tree = FleetSiteBars({ site: { equipment: total, breakdown: { equipment: count } }, axisMax, showBreakdown: true });
    const bar = all(tree, (node) => node.type === "i")[0];
    const segment = all(bar, (node) => node.props.className?.startsWith("mine-fleet-breakdown-segment"))[0];
    return { bar: parseFloat(bar.props.style.height), segment: segment ? parseFloat(bar.props.style.height) * parseFloat(segment.props.style.height) / 100 : 0 };
  };
  for (const total of [4, 15, 31, 48, 52, 82, 142, 208]) {
    assert.ok(Math.abs(render(total, 0).bar - total / axisMax * 100) < 1e-9, `${total} total is linear`);
    for (const count of [1, 2, 3, 4, 8, 10, 12, 23]) {
      if (count > total) continue;
      const { segment } = render(total, count);
      assert.ok(Math.abs(segment - count / axisMax * 100) < 1e-9, `${count} of ${total} sits on the same scale as the totals`);
    }
  }
  // Screenshot regressions: 48 is clearly taller than 31, and 208 is four times 52.
  assert.ok(render(48, 0).bar / render(31, 0).bar > 1.5);
  assert.ok(Math.abs(render(208, 0).bar / render(52, 0).bar - 4) < 1e-9);
  assert.ok(Math.abs(render(208, 12).segment / render(142, 8).segment - 1.5) < 1e-9, "12 is 50% taller than 8");
});

test("chart scale is linear, strictly increasing and identical in Total and Breakdown modes", () => {
  for (const max of [1, 5, 25, 50, 225, 1200]) {
    assert.equal(fleetBarHeightPercent(0, max), 0);
    assert.equal(fleetBarHeightPercent(max, max), 100);
    for (let value = 1; value <= max; value++) {
      assert.ok(fleetBarHeightPercent(value, max) > fleetBarHeightPercent(value - 1, max));
      assert.equal(fleetBarHeightPercent(value, max), value / max * 100);
      assert.equal(fleetBarHeightPercent(value, max, true, 12), fleetBarHeightPercent(value, max), "legacy arguments no longer bend the scale");
    }
  }
  assert.equal(fleetBarHeightPercent(300, 225), 100, "a value above the axis fills the plot rather than overflowing");
});
