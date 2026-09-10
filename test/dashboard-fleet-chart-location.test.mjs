import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";
import * as model from "../src/dashboard-drilldown-model.mjs";
import { REGION_DATA } from "../region-scope.mjs";
import { calculateBreakdownMinutes, formatBreakdownDaysHours } from "../breakdown-duration.mjs";
import { requestStatusSortRank } from "../src/request-status.mjs";
import { filterRecordsByDate } from "../src/record-date-range.mjs";

const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const expression = main.match(/const hideFleetChartLocation = (.+);/)[1];
const hideLocationFor = new Function("assetDrilldown", `return ${expression};`);
const categoryExpression = main.match(/const hideFleetChartCategory = (.+);/)[1];
const hideCategoryFor = new Function("assetDrilldown", `return ${categoryExpression};`);
const source = readFileSync(new URL("../src/dashboard-record-browser.jsx", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace("export default function", "function");
const { code } = await transformWithOxc(source, "record-browser.jsx", { jsx: { runtime: "classic" } });
const bindings = { React, ...model, calculateBreakdownMinutes, formatBreakdownDaysHours, requestStatusSortRank, filterRecordsByDate,
  useEffect: React.useEffect, useId: React.useId, useRef: React.useRef, useState: React.useState,
  ChevronLeft: () => null, ChevronRight: () => null, RotateCcw: () => null };
const Browser = new Function(...Object.keys(bindings), `${code}; return DashboardRecordBrowser;`)(...Object.values(bindings));
const row = { id: "asset-1", door: "E08-MH34BZ2407", category: "Vehicles", currentLocation: "Majri OB", model: "PRO8035L", manufacturerSerialNo: "CHASSIS-1" };
const render = (props = {}) => renderToStaticMarkup(React.createElement(Browser, {
  rows: [row], regions: REGION_DATA, rowsAreScoped: true, initialRegion: "WCL", initialSite: "Majri OB",
  title: "Majri OB · Vehicle records", Status: ({ children }) => children, formatDate: (date) => date || "—",
  ActionsTable: ({ children, exportTitle, printTitle }) => React.createElement("table", { "data-export-title": exportTitle, "data-print-title": printTitle }, children),
  ...props,
}));

test("only Total Fleet site bar drilldowns opt out of Current location", () => {
  for (const key of ["site-total:Majri OB|vehicles", "site-total:Sasti OB|equipment", "site:Majri OB", "offroad-site:Sasti OB", "offroad-site:Majri OB|vehicles"]) {
    assert.equal(hideLocationFor(key), true, key);
  }
  for (const key of ["all", "vehicle", "equipment", "region:WCL", "offroad", "site-status:Majri OB|offroad", "site-repair:Majri OB|Breakdown", "trend:all", "event:closed", "movement:balance", "category-group:vehicle|Tippers"]) {
    assert.equal(hideLocationFor(key), false, key);
  }
  assert.match(main, /hideCurrentLocation=\{hideFleetChartLocation\}/);
});

test("site fleet tables omit only the redundant column and retain counts, record data and export site title", () => {
  const original = render(), hidden = render({ hideCurrentLocation: true });
  assert.ok(original.includes("<th>Current location</th>"));
  assert.ok(original.includes("<td>Majri OB</td>"));
  assert.equal(hidden, original.replace("<th>Current location</th>", "").replace("<td>Majri OB</td>", ""));
  assert.ok(hidden.includes("1 of 1 records"));
  assert.ok(hidden.includes('data-export-title="Majri OB · Vehicle records · WCL"'));
  assert.equal((hidden.match(/<th[ >]/g) || []).length, 8);
  assert.equal((hidden.match(/<td[ >]/g) || []).length, 8);
});

test("other request drilldowns retain Request site even if the fleet-only option is passed", () => {
  const html = render({ requestRecords: true, hideCurrentLocation: true });
  assert.ok(html.includes("<th>Request site</th>"));
  assert.ok(html.includes("<td>Majri OB</td>"));
  assert.equal((html.match(/<th[ >]/g) || []).length, 11);
});

test("empty site fleet lists span exactly their visible columns", () => {
  assert.ok(render({ rows: [], hideCurrentLocation: true }).includes('colSpan="8"'));
  assert.ok(render({ rows: [] }).includes('colSpan="9"'));
  assert.ok(render({ rows: [], requestRecords: true, lifecycleRecords: true, hideCurrentLocation: true }).includes('colSpan="14"'));
  assert.ok(render({ rows: [], requestRecords: true, showBdClosingTime: true }).includes('colSpan="12"'));
});

test("every equipment and vehicle site bar hides category in both fleet and breakdown views", () => {
  for (const region of REGION_DATA) for (const site of region.sites) {
    for (const prefix of ["site-total:", "offroad-site:"]) for (const category of ["equipment", "vehicles"]) {
      const key = `${prefix}${site}|${category}`;
      assert.equal(hideCategoryFor(key), true, key);
    }
  }
  for (const key of ["site:Majri OB", "offroad-site:Majri OB", "all", "region:WCL", "equipment", "vehicle", "fleet-breakdown:all", "fleet-breakdown:vehicles", "trend:all", "event:closed", "site-status:Majri OB|offroad", "site-repair:Majri OB|Breakdown"]) {
    assert.equal(hideCategoryFor(key), false, key);
  }
  assert.match(main, /hideEquipmentCategory=\{hideFleetChartCategory\}/);
});

test("single-category bar lists omit only the category column with counts and other content unchanged", () => {
  for (const category of ["Equipment", "Vehicles"]) {
    const props = { rows: [{ ...row, category }], hideCurrentLocation: true };
    const original = render(props), hidden = render({ ...props, hideEquipmentCategory: true });
    assert.equal(hidden, original.replace("<th>Equipment category</th>", "").replace(`<td>${category}</td>`, ""));
    assert.ok(hidden.includes("1 of 1 records"));
    assert.equal((hidden.match(/<th[ >]/g) || []).length, 7);
    assert.equal((hidden.match(/<td[ >]/g) || []).length, 7);
  }
});

test("category visibility keeps empty tables aligned and request lists unchanged", () => {
  assert.ok(render({ rows: [], hideEquipmentCategory: true }).includes('colSpan="8"'));
  assert.ok(render({ rows: [], hideEquipmentCategory: true, hideCurrentLocation: true }).includes('colSpan="7"'));
  assert.equal(render({ requestRecords: true, hideEquipmentCategory: true }), render({ requestRecords: true }));
  assert.equal(render({ requestRecords: true, lifecycleRecords: true, hideEquipmentCategory: true }), render({ requestRecords: true, lifecycleRecords: true }));
});
