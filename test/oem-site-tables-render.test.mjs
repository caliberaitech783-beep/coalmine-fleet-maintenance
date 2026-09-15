import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { createPortal } from "react-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ListFilter, RotateCcw, Search } from "lucide-react";
import * as drilldown from "../src/dashboard-drilldown-model.mjs";
import * as tableModel from "../src/table-actions-model.mjs";
import * as recordDates from "../src/record-date-range.mjs";
import * as dateRanges from "../src/date-range-filter.mjs";
import { groupOemRecordsBySite } from "../src/oem-dashboard-filters.mjs";
import { matchesSmartSearch } from "../smart-search.mjs";
import { calculateBreakdownMinutes, formatBreakdownDaysHours } from "../breakdown-duration.mjs";
import { requestStatusSortRank } from "../src/request-status.mjs";
import { formatDisplayDateTime } from "../date-time-format.mjs";

// Compile the real JSX components in memory, using the repository's render-test
// harness. This does not run the site build or touch the preview's app version.
const names = { "oem-breakdown-details": "OemBreakdownDetails", "dashboard-record-browser": "DashboardRecordBrowser", "shared-actions-table": "SharedActionsTable", "record-date-range": "RecordDateRange" };
const compiled = Object.fromEntries(await Promise.all(Object.entries(names).map(async ([file, name]) => {
  const source = readFileSync(new URL(`../src/${file}.jsx`, import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "").replace("export default function", "function");
  const { code } = await transformWithOxc(source, `${file}.jsx`, { jsx: { runtime: "classic" } });
  return [file, `${code}; return ${name};`];
})));
const bindings = { React, createPortal, ...drilldown, ...tableModel, ...recordDates, ...dateRanges, groupOemRecordsBySite, matchesSmartSearch,
  calculateBreakdownMinutes, formatBreakdownDaysHours, requestStatusSortRank,
  useState: React.useState, useEffect: React.useEffect, useMemo: React.useMemo, useId: React.useId, useRef: React.useRef,
  ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ListFilter, RotateCcw, Search };
const load = (file, extra = {}) => {
  const values = { ...bindings, ...extra };
  return new Function(...Object.keys(values), compiled[file])(...Object.values(values));
};
const RecordDateRange = load("record-date-range");
const SharedActionsTable = load("shared-actions-table", { RecordDateRange });
const DashboardRecordBrowser = load("dashboard-record-browser");
const Details = load("oem-breakdown-details", { DashboardRecordBrowser });
const h = React.createElement, Empty = () => null;
const regions = [{ code: "WCL", sites: ["Sasti OB", "Majri OB"] }, { code: "NCL", sites: ["Jayant OB"] }];
const request = (id, site, door, assetId = id) => ({
  id, assetId, requestReference: `JOB-${id}`, requestSite: site, currentLocation: "Moved workshop", door,
  category: "Vehicle", group: "SCANIA TIPPERS", make: "Scania", model: "P410", manufacturerSerialNo: `SERIAL-${id}`,
  requestStatus: "Closed", requestStart: "2026-09-10 08:00:00", requestClosed: "2026-09-10 12:00:00", repairCategory: "Breakdown",
  requestDetails: { complaint: "Engine inspection", owner: "Production", closedBy: "Maintenance", hours: "4 hours", dailyRemarks: [] },
});
// Interleave sites, include an alias, and retain two requests for the same asset.
const requests = [request("S1", "Sasti OB", "S-10", "SASTI-ASSET"), request("J1", "Jayant OB", "J-2"),
  request("M1", "Majri OB", "M-1"), request("S2", "SASTI II", "S-10", "SASTI-ASSET"), request("J2", "Jayant OB", "J-10")];
const fleet = [requests[0], requests[1], requests[2], requests[4]].map(({ requestSite, requestReference, requestDetails, ...record }) =>
  ({ ...record, id: record.assetId, currentLocation: requestSite }));
const selectionFor = (records, extra = {}) => ({ label: "All OEMs", periodLabel: "10 Sep 2026", regions, records,
  rows: [...new Map(records.map(record => [record.assetId, record])).values()], ...extra });

// Only toolbar dialogs and file delivery are substituted. Real SharedActionsTable
// rendering and the export/print models remain on the production path.
function renderDetails(selection) {
  const exports = [];
  const CaptureExport = props => { exports.push(props); return null; };
  const ActionsTable = props => h(SharedActionsTable, { ...props, Menu: Empty, ColumnsDialog: Empty, SortDialog: Empty, FilterDialog: Empty, ExportMenu: CaptureExport });
  const html = renderToStaticMarkup(h(Details, { selection, title: "OEM breakdown", ActionsTable,
    Status: ({ children }) => children, formatDate: formatDisplayDateTime, MaintenanceRemarks: Empty }));
  return { html, exports, sections: renderedSections(html) };
}

const text = markup => markup.replace(/<[^>]*>/g, "").replaceAll("&amp;", "&");
function renderedSections(html) {
  return [...html.matchAll(/<section\b[^>]*class="mine-oem-site-section"[^>]*>([\s\S]*?)<\/section>/g)].map(([, markup]) => {
    const heading = text(markup.match(/<h4>([\s\S]*?)<\/h4>/)?.[1] || "");
    const headers = [...(markup.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] || "").matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map(([, cell]) => text(cell));
    const rows = [...(markup.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] || "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
      .map(([, row]) => [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(([, cell]) => text(cell)));
    return { heading, headers, rows, markup };
  });
}

function verifySiteTables(result, expectedSites, identityColumn) {
  assert.deepEqual(result.sections.map(section => section.heading), expectedSites.map(([heading]) => heading));
  assert.equal((result.html.match(/<table\b/g) || []).length, expectedSites.length);
  assert.equal(result.exports.length, expectedSites.length * 2, "each site has export and print models");
  assert.doesNotMatch(result.html, /type="date"|role="tablist"|<details\b/);
  const allDisplayed = [], allExported = [];
  for (const [index, [heading, identities]] of expectedSites.entries()) {
    const section = result.sections[index];
    assert.equal((section.markup.match(/<table\b/g) || []).length, 1);
    assert.ok(section.markup.indexOf("<h4>") < section.markup.indexOf("<table"), "site heading precedes its table");
    assert.equal(section.headers[0], "No.");
    assert.ok(!section.headers.some(label => ["Request site", "Current location"].includes(label)));
    const identityIndex = section.headers.indexOf(identityColumn);
    assert.ok(identityIndex >= 0, `missing ${identityColumn}`);
    const displayed = section.rows.map(row => row[identityIndex]);
    assert.deepEqual(displayed, identities);
    assert.deepEqual(section.rows.map(row => row[0]), identities.map((_, i) => String(i + 1)), "row numbering restarts at each site");
    assert.ok(section.rows.every(row => row.length === section.headers.length), "headings and cells stay aligned");
    allDisplayed.push(...displayed);
    const siteExports = result.exports.filter(model => model.title.includes(heading));
    assert.equal(siteExports.length, 2, `print/export titles identify ${heading}`);
    assert.equal(siteExports.filter(model => model.printOnly).length, 1);
    for (const model of siteExports) {
      assert.deepEqual(model.columns.map(column => column.label), section.headers);
      assert.equal(model.smartPrintColumns[0].label, "No.");
      assert.ok(!model.smartPrintColumns.some(column => ["Request site", "Current location"].includes(column.label)));
      for (const [columns, rows] of [[model.columns, model.rows], [model.smartPrintColumns, model.smartPrintRows]]) {
        assert.deepEqual(rows.map(row => columns[0].value(row)), identities.map((_, i) => i + 1));
        assert.deepEqual(rows.map(row => columns.find(column => column.label === identityColumn).value(row)), identities);
      }
      if (!model.printOnly) allExported.push(...model.rows.map(row => model.columns.find(column => column.label === identityColumn).value(row)));
    }
  }
  const expected = expectedSites.flatMap(([, identities]) => identities);
  assert.deepEqual(allDisplayed, expected, "every supplied record appears exactly once in the tables");
  assert.deepEqual(allExported, expected, "every supplied record appears exactly once across site exports");
  assert.equal(new Set(allDisplayed).size, expected.length);
}

test("real OEM request details render all sites separately with site headings, per-site numbering and exports", () => {
  const result = renderDetails(selectionFor(requests));
  verifySiteTables(result, [["WCL · Sasti OB", ["JOB-S1", "JOB-S2"]], ["WCL · Majri OB", ["JOB-M1"]], ["NCL · Jayant OB", ["JOB-J1", "JOB-J2"]]], "Job reference");
  assert.match(result.html, /Showing 4 of 4 assets · 5 of 5 records/);
  assert.ok(result.sections.every(section => section.headers.includes("Daily remarks") && section.headers.includes("Reason")));
});

test("real OEM fleet details retain all sites without a Current location column", () => {
  const result = renderDetails(selectionFor(fleet, { fleetOnly: true }));
  verifySiteTables(result, [["WCL · Sasti OB", ["S-10"]], ["WCL · Majri OB", ["M-1"]], ["NCL · Jayant OB", ["J-2", "J-10"]]], "Machine / Door no.");
  assert.ok(result.sections.every(section => section.headers.includes("OEM") && !section.headers.includes("Job reference")));
});

test("a parent selection containing one site renders exactly one site section", () => {
  const selectedRegions = [{ code: "WCL", sites: ["Sasti OB"] }];
  const result = renderDetails(selectionFor([requests[0], requests[3]], { site: "Sasti OB", regions: selectedRegions }));
  verifySiteTables(result, [["WCL · Sasti OB", ["JOB-S1", "JOB-S2"]]], "Job reference");
  assert.doesNotMatch(result.html, /<h4>.*(?:Majri|Jayant)/);
});

for (const fleetOnly of [false, true]) test(`empty OEM ${fleetOnly ? "fleet" : "request"} details show a message without empty site tables`, () => {
  const result = renderDetails(selectionFor([], { fleetOnly }));
  assert.deepEqual(result.sections, []);
  assert.deepEqual(result.exports, []);
  assert.doesNotMatch(result.html, /<table\b/);
  assert.ok(result.html.includes(`<b>No matching ${fleetOnly ? "fleet records" : "requests"}</b>`));
  assert.match(result.html, /Change the filters above to view another site or OEM\./);
  assert.match(result.html, /Showing 0 of 0 assets · 0 of 0 records/);
});
