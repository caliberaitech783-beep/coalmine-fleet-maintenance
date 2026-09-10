import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { transformWithOxc } from "vite";
import { availabilityRequestsForDate } from "../src/dashboard-availability.mjs";
import { dashboardFleetSnapshot } from "../dashboard-fleet-snapshot.mjs";
import { liveEquipmentMetrics, liveEquipmentRoadStatus } from "../dashboard-equipment-metrics.mjs";
import { recordBelongsToSite } from "../site-location.mjs";
import { formatDisplayDate } from "../date-time-format.mjs";

const assets = [
  ...["A", "B", "C", "D"].map(door => ({ door, currentLocation: "Majri OB", category: "Vehicles" })),
  { door: "A", currentLocation: "Jayant OB", category: "Equipment" },
];
const requests = [
  { ref: "OLDER", door: "A", site: "Majri OB", start: "2026-09-05 · 09:00:00", closedAt: "2026-09-09 08:00:00", status: "Closed" },
  { ref: "IDLE", door: "B", site: "Majri OB", start: "2026-09-06 10:00:00", idealRequestedAt: "2026-09-08 10:00:00", status: "Idle" },
  { ref: "LATER", door: "C", site: "Majri OB", start: "2026-09-08 09:00:00", status: "Open" },
  { ref: "OTHER-SITE", door: "A", site: "Jayant OB", start: "2026-09-05 09:00:00", status: "Open" },
];
const atMajri = assets.filter(row => row.currentLocation === "Majri OB");

test("availability follows the selected day's outstanding requests, closures and idle transitions", () => {
  const expected = [
    ["2026-09-04", 4, 0, 0, 100],
    ["2026-09-07", 2, 2, 0, 50],
    ["2026-09-08", 1, 2, 1, 25],
    ["2026-09-09", 2, 1, 1, 50],
  ];
  const original = structuredClone(requests);
  for (const [date, onRoad, offRoad, idle, availability] of expected) {
    assert.deepEqual(liveEquipmentMetrics(atMajri, availabilityRequestsForDate(requests, date)), {
      total: 4, onRoad, offRoad, idle, availability, unknown: 0,
    });
  }
  assert.deepEqual(requests, original, "snapshot calculations must not change other dashboard consumers");
});

test("clearing the date restores the same live fleet source", () => {
  assert.equal(availabilityRequestsForDate(requests, ""), requests);
  assert.deepEqual(liveEquipmentMetrics(atMajri, availabilityRequestsForDate(requests)), liveEquipmentMetrics(atMajri, requests));
});

test("the selected day uses IST midnight boundaries for zoned timestamps", () => {
  const rows = [
    { ref: "LAST-SECOND", start: "2026-09-07T18:29:59.999Z", status: "Open" },
    { ref: "NEXT-DAY", start: "2026-09-07T18:30:00Z", status: "Open" },
    { ref: "CLOSED", start: "2026-09-07", status: "Closed", closedAt: "2026-09-07T18:29:59.999Z" },
    { ref: "CLOSES-TOMORROW", start: "2026-09-07", status: "Closed", closedAt: "2026-09-07T18:30:00Z" },
  ];
  assert.deepEqual(availabilityRequestsForDate(rows, "2026-09-07").map(row => row.ref), ["LAST-SECOND", "CLOSES-TOMORROW"]);
});

test("manager on-road approval ends a historical idle period", () => {
  const row = { start: "2026-09-01", idealRequestedAt: "2026-09-03 12:00:00", idealApprovedAt: "2026-09-05 12:00:00", status: "Closed" };
  assert.equal(availabilityRequestsForDate([row], "2026-09-02")[0].status, "Open");
  assert.equal(availabilityRequestsForDate([row], "2026-09-04")[0].status, "Idle");
  assert.deepEqual(availabilityRequestsForDate([row], "2026-09-05"), []);
});

test("legacy timestamps and incomplete history do not fabricate dated requests", () => {
  const rows = [
    { ref: "FALLBACK", start: "invalid", createdAt: "2026-09-06", status: "Open" },
    { ref: "LEGACY-IDLE", startedAt: "2026-09-06", closedAt: "2026-09-07 10:00:00", status: "Ideal" },
    { ref: "UNKNOWN-CLOSE", start: "2026-09-06", status: "Closed" },
    { ref: "UNDATED", status: "Open" },
  ];
  assert.deepEqual(availabilityRequestsForDate(rows, "2026-09-07").map(row => [row.ref, row.status]), [["FALLBACK", "Open"], ["LEGACY-IDLE", "Idle"]]);
  assert.deepEqual(availabilityRequestsForDate(rows, "invalid"), []);
});

// Evaluate the dashboard's actual calculations and render its unchanged JSX
// section, so a disconnected date prop or a card using the old totals fails.
const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const calculations = source.slice(source.indexOf("  const availabilityDate ="), source.indexOf("  const breakdownSummaryEndKey ="));
const siteCalculation = source.match(/  const availabilityCountBySite = [\s\S]*?\n  \}\)\);/)[0];
const viewStart = source.indexOf('<div className="mine-site-road-view">');
const view = source.slice(viewStart, source.indexOf(" : <FleetDataState", viewStart));
const viewCode = (await transformWithOxc(`const tree = (${view});`, "AvailabilityView.jsx", { jsx: { runtime: "classic" } })).code;
const drilldownStart = source.indexOf("  const rowsForAssetDrilldown =");
const drilldownCode = source.slice(drilldownStart, source.indexOf("  const assetDrilldownRows =", drilldownStart));
const all = (tree, predicate) => {
  const found = [];
  const visit = node => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!React.isValidElement(node)) return;
    if (predicate(node)) found.push(node);
    visit(node.props.children);
  };
  visit(tree);
  return found;
};
const text = node => Array.isArray(node) ? node.map(text).join("") : React.isValidElement(node) ? text(node.props.children) : node == null ? "" : String(node);

function dashboardSection(date) {
  const scope = {
    dashboardReconnecting: false,
    React, availabilityRequestsForDate, dashboardFleetSnapshot, liveEquipmentMetrics, liveEquipmentRoadStatus, recordBelongsToSite,
    throughputRequests: requests, dashboardDate: "2026-01-01", breakdownSummaryFrom: date, breakdownSummaryTo: date, availabilityAsOf: date, todayKey: "2026-09-10", throughputEquipment: assets,
    breakdownSummaryStartKey: "2026-09-01", breakdownSummaryEndKey: date || "2026-09-10", formatDisplayDate,
    throughputSites: ["Majri OB", "Jayant OB"], roadFocusSite: "", openAssetDrilldown: () => {},
    // The other charts deliberately keep their existing day-of-submission filter.
    visibleBreakdowns: [], kpis: { onRoad: 999, offRoad: 999, idle: 999, availability: 999 },
    CheckCircle2: () => null, AlertTriangle: () => null, Clock: () => null, MapPin: () => null, ChevronRight: () => null,
  };
  return new Function(...Object.keys(scope), `${calculations}\n${siteCalculation}
    const roadStatusTotal = availabilityKpis.total;
    const roadStatusShare = value => roadStatusTotal ? value / roadStatusTotal * 100 : 0;
    ${drilldownCode}\n${viewCode}
    return {tree, availabilityKpis, availabilityCountBySite, rowsForAssetDrilldown};
  `)(...Object.values(scope));
}

test("date changes update the rendered availability cards, every site row and their detail lists together", () => {
  for (const date of ["2026-09-04", "2026-09-07", "2026-09-08", "2026-09-09", ""]) {
    const section = dashboardSection(date);
    const metrics = section.availabilityKpis;
    const summary = all(section.tree, node => node.props.className === "mine-site-road-summary")[0];
    assert.deepEqual(all(summary, node => node.type === "strong").map(node => Number(text(node))), [metrics.total, metrics.onRoad, metrics.offRoad, metrics.idle]);
    const gauge = all(summary, node => node.props.className === "mine-site-road-gauge")[0];
    assert.equal(text(all(gauge, node => node.type === "b")[0]), `${metrics.availability}%`);
    const rows = all(section.tree, node => node.props.className?.startsWith("mine-road-site-row"));
    assert.equal(rows.length, 2);
    rows.forEach((row, index) => {
      const site = section.availabilityCountBySite[index];
      assert.deepEqual(all(row, node => node.props.className?.startsWith("metric ")).map(node => Number(text(node))), [site.total, site.onRoad, site.offRoad, site.idle]);
    });
    for (const [key, count] of [["onroad", metrics.onRoad], ["offroad", metrics.offRoad], ["idle", metrics.idle]]) {
      assert.equal(section.rowsForAssetDrilldown(key).length, count);
    }
    for (const key of ["total", "onRoad", "offRoad", "idle"]) {
      assert.equal(section.availabilityCountBySite.reduce((sum, row) => sum + row[key], 0), metrics[key]);
    }
  }
});

test("the date filter affects historical availability while live fleet metrics retain all active requests", () => {
  assert.match(source, /aria-label="Dashboard date"[^>]*onChange=\{\(event\) => setDashboardDate\(event.target.value\)\}/);
  assert.match(source, /const kpis = liveEquipmentMetrics\(visibleEquipment, liveBreakdowns\)/);
  assert.match(source, /new Map\(availabilityCountBySite.map/);
  assert.match(source, /const siteRequests = liveBreakdowns.filter/);
  assert.match(source, /availabilityDate \? dashboardFleetSnapshot\(throughputEquipment, availabilityRequests\)/);
});
