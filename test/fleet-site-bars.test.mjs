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

test("screenshot regression: 3 of 31 is taller than 2 of 52 on the same chart", () => {
  const segmentHeight = (total, count) => {
    const tree = FleetSiteBars({site: {equipment: total, breakdown: {equipment: count}}, axisMax: 225, showBreakdown: true});
    const bar = all(tree, (node) => node.type === "i")[0];
    const segment = all(bar, (node) => node.props.className?.startsWith("mine-fleet-breakdown-segment"))[0];
    return parseFloat(bar.props.style.height) * parseFloat(segment.props.style.height) / 100;
  };
  assert.ok(segmentHeight(31, 3) > segmentHeight(52, 2));
  assert.ok(segmentHeight(31, 3) > 3 / 225 * 100, "small bars are still enlarged");
  for (const count of [1, 2, 3, 4, 8, 10, 12]) {
    const expected = fleetBarHeightPercent(count, 225, true);
    for (const total of [count, 31, 48, 52, 82, 142, 208]) {
      assert.ok(Math.abs(segmentHeight(total, count) - expected) < 1e-9, `${count} of ${total}`);
      if (total > count) assert.ok(segmentHeight(total, count) < fleetBarHeightPercent(total, 225, true));
    }
  }
});

test("common chart scale is strictly increasing, keeps zero at zero, and Total mode remains linear", () => {
  for (const max of [1, 5, 25, 50, 225, 1200]) {
    assert.equal(fleetBarHeightPercent(0, max, true), 0);
    assert.equal(fleetBarHeightPercent(max, max, true), 100);
    for (let value = 1; value <= max; value++) {
      assert.ok(fleetBarHeightPercent(value, max, true) > fleetBarHeightPercent(value - 1, max, true));
      assert.equal(fleetBarHeightPercent(value, max, false), value / max * 100);
    }
  }
});

test("8, 10 and 12 have visibly different, exactly proportional green bars across different totals", () => {
  const height = (total, count) => {
    const tree = FleetSiteBars({site: {equipment: total, breakdown: {equipment: count}}, axisMax: 225, showBreakdown: true, breakdownScaleMax: 12});
    const bar = all(tree, node => node.type === "i")[0];
    const segment = all(bar, node => node.props.className?.startsWith("mine-fleet-breakdown-segment"))[0];
    return parseFloat(bar.props.style.height) * parseFloat(segment.props.style.height) / 100;
  };
  const values = [height(142, 8), height(49, 10), height(208, 12)];
  assert.ok(Math.abs(values[2] / values[0] - 1.5) < 1e-9, "12 is 50% taller than 8");
  assert.ok(Math.abs(values[1] / values[0] - 1.25) < 1e-9, "10 is 25% taller than 8");
  for (let i = 1; i < values.length; i++) assert.ok((values[i] - values[i - 1]) * 2 >= 15, "at least 15px apart even in a 200px plot");
  assert.ok(height(31, 3) > height(52, 2), "the earlier 2-versus-3 fix remains intact");
});

test("the enlarged band follows the maximum breakdown count, without compressing any green values", () => {
  for (const peak of [5, 12, 24, 50, 100, 225]) {
    const step = fleetBarHeightPercent(1, 225, true, peak);
    for (let count = 1; count <= peak; count++) {
      assert.ok(Math.abs(fleetBarHeightPercent(count, 225, true, peak) - step * count) < 1e-9, `${count} of ${peak}: every breakdown value is on one linear band`);
    }
  }
});
