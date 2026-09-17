import { groupReportRows, reportSite, reportAsset, reportCount, siteReportHtml } from "../src/site-report.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { defaultDurationSort } from "../src/duration-sort.mjs";
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
const bindings = { groupReportRows, reportSite, reportAsset, reportCount, React, createPortal, ...drilldown, ...tableModel, ...recordDates, ...dateRanges, defaultDurationSort, groupOemRecordsBySite, matchesSmartSearch,
  calculateBreakdownMinutes, formatBreakdownDaysHours, requestStatusSortRank,
  useState: React.useState, useEffect: React.useEffect, useMemo: React.useMemo, useId: React.useId, useRef: React.useRef,
  ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ListFilter, RotateCcw, Search };
const load = (file, extra = {}) => {
  const values = { ...bindings, ...extra };
  return new Function(...Object.keys(values), compiled[file])(...Object.values(values));
};
const RecordDateRange = load("record-date-range");
const SharedActionsTable = load("shared-actions-table", { RecordDateRange, useTableLayouts: () => ({ layouts: [] }), TableLayoutSelect: () => null });
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
  // Server rendering has no DOM ref for the browser's toolbar portal. Render
  // that toolbar inline so this harness can inspect the real export models.
  const ActionsTable = props => h(SharedActionsTable, { ...props, toolbarPortal: false, Menu: Empty, ColumnsDialog: Empty, SortDialog: Empty, FilterDialog: Empty, ExportMenu: CaptureExport });
  const html = renderToStaticMarkup(h(Details, { selection, title: "OEM breakdown", ActionsTable,
    Status: ({ children }) => children, formatDate: formatDisplayDateTime, MaintenanceRemarks: Empty }));
  return { html, exports };
}

test("one toolbar controls the complete site-grouped report and distinguishes assets from records", () => {
  const result = renderDetails(selectionFor(requests));
  assert.equal(result.exports.length, 2);
  assert.equal(result.exports.filter(model => model.printOnly).length, 1);
  assert.equal((result.html.match(/class="shared-table-actions-toolbar"/g) || []).length, 1);
  assert.equal((result.html.match(/class="site-report-heading"/g) || []).length, 3);
  assert.match(result.html, /Site-wise summary/);
  assert.match(result.html, /1 asset · 2 records/);
  for (const model of result.exports) {
    assert.equal(model.rows.length, 5);
    assert.deepEqual(model.rows.map(model.columns[0].value), [1,2,3,4,5]);
    assert.deepEqual(groupReportRows(model.rows, model.reportGrouping.site, model.reportGrouping.asset).map(group => [group.label, group.assets, group.rows.length]), [
      ["WCL · Sasti OB",1,2], ["WCL · Majri OB",1,1], ["NCL · Jayant OB",2,2]
    ]);
    const html = siteReportHtml({ rows: model.rows, columns: model.columns,
      cells: model.rows.map(row => model.columns.map(column => column.value(row))),
      grouping: model.reportGrouping, escape: value => String(value ?? "").replaceAll("<", "&lt;") });
    assert.equal((html.match(/class="site-print-table"/g) || []).length, 3);
    assert.ok(html.includes("<b>Total: 4 assets · 5 records</b>"));
  }
});

test("filtered, fleet-only and empty selections use the same combined report", () => {
  for (const selection of [selectionFor([requests[0]]), selectionFor(fleet, { fleetOnly: true }), selectionFor([])]) {
    const result = renderDetails(selection);
    assert.equal(result.exports.length, 2);
    assert.equal(result.exports[0].rows.length, selection.records.length);
    assert.equal((result.html.match(/class="shared-table-actions-toolbar"/g) || []).length, 1);
  }
});
