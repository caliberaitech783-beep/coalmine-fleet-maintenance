import {createRowSearchIndex} from "../src/indexed-smart-search.mjs";
import { groupReportRows, reportSite, reportAsset, reportCount, splitReportSite, siteReportHtml } from "../src/site-report.mjs";
import { orderOemDetailColumns } from "../src/oem-detail-columns.mjs";
import { pulseDelayReason } from "../src/info-pulse-reasons.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { defaultDurationSort } from "../src/duration-sort.mjs";
import { createPortal } from "react-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Eye, EyeOff, ListFilter, RotateCcw, Search } from "lucide-react";
import * as drilldown from "../src/dashboard-drilldown-model.mjs";
import * as tableModel from "../src/table-actions-model.mjs";
import * as recordDates from "../src/record-date-range.mjs";
import * as dateRanges from "../src/date-range-filter.mjs";
import { groupOemRecordsBySite, oemDetailReportRows, oemEquipmentLabel } from "../src/oem-dashboard-filters.mjs";
import { matchesSmartSearch } from "../smart-search.mjs";
import { calculateBreakdownMinutes, formatBreakdownDaysHours } from "../breakdown-duration.mjs";
import { requestStatusSortRank } from "../src/request-status.mjs";
import { formatDisplayDateTime } from "../date-time-format.mjs";
import { dailyUpdatesExportText } from "../src/daily-updates-order.mjs";
import { breakdownMeterColumns } from "../breakdown-meter-columns.mjs";
import * as mobileWindow from "../src/mobile-table-window.mjs";

// Compile the real JSX components in memory, using the repository's render-test
// harness. This does not run the site build or touch the preview's app version.
const names = { "oem-breakdown-details": "OemBreakdownDetails", "dashboard-record-browser": "DashboardRecordBrowser", "shared-actions-table": "SharedActionsTable", "record-date-range": "RecordDateRange" };
const compiled = Object.fromEntries(await Promise.all(Object.entries(names).map(async ([file, name]) => {
  const source = readFileSync(new URL(`../src/${file}.jsx`, import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "").replace("export default function", "function");
  const { code } = await transformWithOxc(source, `${file}.jsx`, { jsx: { runtime: "classic" } });
  return [file, `${code}; return ${name};`];
})));
const bindings = { createRowSearchIndex, useDeferredValue: value => value, ...mobileWindow, mobileTablePageSize: () => 0, BreakdownReasonHistory: ({reason}) => reason || "—", orderOemDetailColumns, pulseDelayReason, groupReportRows, reportSite, reportAsset, reportCount, splitReportSite, React, createPortal, ...drilldown, ...tableModel, ...recordDates, ...dateRanges, defaultDurationSort, groupOemRecordsBySite, matchesSmartSearch, dailyUpdatesExportText, breakdownMeterColumns,
  calculateBreakdownMinutes, formatBreakdownDaysHours, requestStatusSortRank,
  useState: React.useState, useEffect: React.useEffect, useMemo: React.useMemo, useId: React.useId, useRef: React.useRef,
  ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Eye, EyeOff, ListFilter, RotateCcw, Search };
const load = (file, extra = {}) => {
  const values = { ...bindings, ...extra };
  values.useColumnPreferences = (table, columns) => values.useState(() => columns.map(column => column.key));
  return new Function(...Object.keys(values), compiled[file])(...Object.values(values));
};
const RecordDateRange = load("record-date-range");
const SharedActionsTable = load("shared-actions-table", { RecordDateRange, useTableLayouts: () => ({ layouts: [] }), TableLayoutSelect: () => null });
const DashboardRecordBrowser = load("dashboard-record-browser");
const Details = load("oem-breakdown-details", { DashboardRecordBrowser, oemDetailReportRows, oemEquipmentLabel });
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
function renderDetails(selection, selectedSite = "", oemWise = false) {
  let stateIndex = 0;
  const ReportDetails = oemWise ? load("oem-breakdown-details", {DashboardRecordBrowser, oemDetailReportRows, oemEquipmentLabel, useState: initial => React.useState(stateIndex++ === 1 ? true : initial)}) : Details;
  const SelectedTable = load("shared-actions-table", { RecordDateRange, useTableLayouts: () => ({ layouts: [] }), TableLayoutSelect: () => null, useState: initial => React.useState(initial && typeof initial === "object" && "selectedSite" in initial ? { selectedSite } : initial) });
  const exports = [];
  const CaptureExport = props => { exports.push(props); return null; };
  // Server rendering has no DOM ref for the browser's toolbar portal. Render
  // that toolbar inline so this harness can inspect the real export models.
  const ActionsTable = props => h(SelectedTable, { ...props, toolbarPortal: false, Menu: Empty, ColumnsDialog: Empty, SortDialog: Empty, FilterDialog: Empty, ExportMenu: CaptureExport });
  const html = renderToStaticMarkup(h(ReportDetails, { selection, title: "OEM breakdown", ActionsTable,
    Status: ({ children }) => children, formatDate: formatDisplayDateTime, MaintenanceRemarks: Empty }));
  return { html, exports };
}

test("OEM report places grouping beside count and reasons before trailing meters", () => {
  const record = request('D1', 'Sasti OB', 'S-1');
  record.requestDetails.dailyRemarks = [{createdAt: '2026-09-30 10:00', remark: 'Waiting', delayReason: 'Parts - OEM'}];
  const result = renderDetails(selectionFor([record]));
  assert.doesNotMatch(result.html, /All OEMs grouped by site|Each site split by OEM equipment type, with separate counts/);
  assert.match(result.html, /shared-table-record-count[\s\S]*?mine-oem-view-tabs[\s\S]*?Site-wise report/);
  assert.match(result.html, /Parts - OEM/);
  for (const model of result.exports) {
    const labels = model.columns.map(column => column.label);
    const reason = labels.indexOf('BD reason');
    assert.deepEqual(labels.slice(reason + 1, reason + 3), ['Delayed reason', 'Daily remarks']);
    assert.deepEqual(labels.slice(-4), ['Opening HMR', 'Opening KMR', 'Closing HMR', 'Closing KMR']);
  }
});

test("both OEM report modes place each site heading before its compact column headings", () => {
  for (const oemWise of [false, true]) {
    const {html} = renderDetails(selectionFor(requests), '', oemWise);
    assert.match(html, /class="site-report-heading"[\s\S]*?class="site-report-columns"/);
    assert.equal((html.match(/class="site-report-heading"/g) || []).length, (html.match(/class="site-report-columns"/g) || []).length);
    assert.doesNotMatch(html, /<thead>/);
    assert.ok(html.indexOf('mine-oem-top-toolbar') < html.indexOf('mine-oem-report-navigation'));
  }
});

test("OEM-wise view splits site sections and preserves the same grouping in print and export", () => {
  const result=renderDetails(selectionFor([...requests,{...request('V1','Sasti OB','V-1'),make:'Volvo'}]),'',true);
  assert.match(result.html,/OEM-wise report/);
  assert.match(result.html,/Sasti OB — SCANIA TIPPERS/);
  assert.match(result.html,/Sasti OB — Volvo/);
  assert.equal((result.html.match(/class="site-report-heading"/g)||[]).length,4);
  for(const model of result.exports){
    assert.equal(model.rows.length,6);
    assert.equal(groupReportRows(model.rows,model.reportGrouping.site,model.reportGrouping.asset).length,4);
  }
});

test("one toolbar controls the complete site-grouped report and distinguishes assets from records", () => {
  const result = renderDetails(selectionFor(requests));
  assert.equal(result.exports.length, 1);
  assert.equal(result.exports[0].smartPrintItem, true);
  assert.deepEqual(result.exports[0].smartPrintRows, result.exports[0].rows);
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
    assert.equal(result.exports.length, 1);
    assert.equal(result.exports[0].rows.length, selection.records.length);
    assert.equal((result.html.match(/class="shared-table-actions-toolbar"/g) || []).length, 1);
  }
});

test("site selection filters table, print and exports while retaining all site buttons", () => {
  const result = renderDetails(selectionFor(requests), "WCL · Sasti OB");
  for (const model of result.exports) {
    assert.equal(model.rows.length, 2);
    assert.ok(model.rows.every(row => model.reportGrouping.site(row) === "WCL · Sasti OB"));
  }
  assert.match(result.html, /aria-pressed="true"><strong>Sasti OB/);
  assert.match(result.html, /<strong>Jayant OB/);
  assert.match(result.html, /<strong>All sites/);
  assert.doesNotMatch(result.html, /<strong>WCL ·/);
  assert.equal((result.html.match(/class="site-report-heading"/g)||[]).length,1);
  assert.equal(renderDetails(selectionFor(requests)).exports[0].rows.length,5);
  assert.equal(renderDetails(selectionFor([requests[1]]), "WCL · Sasti OB").exports[0].rows.length,1);
});

test("Days of BD clears site selection and sorts across sites in both directions", () => {
  const state = [];
  let cursor = 0;
  const useState = initial => {
    const index = cursor++;
    if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
    return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
  };
  const values = { ...bindings, useState, useEffect() {}, useMemo: fn => fn(), useRef: () => ({current:null}),
    RecordDateRange: Empty, useTableLayouts: () => ({layouts:[]}), TableLayoutSelect: Empty,
    useColumnPreferences: (name, columns) => [columns.map(column => column.key), () => {}] };
  const View = new Function(...Object.keys(values), compiled['shared-actions-table'].replace('return SharedActionsTable;', 'return TableView;'))(...Object.values(values));
  const children = [h('thead', {}, h('tr', {}, h('th', {}, 'Door'), h('th', {}, 'Days of BD'))),
    h('tbody', {}, ...[['a','Sasti', '0d 1h 0m'], ['b','Majri','2d 0h 0m'], ['c','Sasti','0d 3h 0m']].map(([id,site,time]) =>
      h('tr', {key:id, 'data-report-site':site, 'data-report-asset':id}, h('td',{},id), h('td',{},time))))];
  const model = tableModel.tableModel(children);
  const find = (node, predicate) => Array.isArray(node) ? node.flatMap(n => find(n,predicate)) : React.isValidElement(node) ? [...(predicate(node) ? [node] : []), ...find(node.props.children,predicate)] : [];
  const render = () => { cursor=0; return View({...model, groupBySite:true, Menu:Empty, ColumnsDialog:Empty, SortDialog:Empty, FilterDialog:Empty, ExportMenu:Empty, exportTitle:'Test', tableProps:{}, showRowNumbers:true}); };
  let tree=render();
  find(tree,n => n.type==='button' && find(n,c => c.type==='strong' && c.props.children==='Sasti').length)[0].props.onClick();
  tree=render();
  const header = () => find(tree,n => n.type==='button' && n.props.title==='Sort by Days of BD')[0];
  header().props.onClick(); tree=render();
  let exported = find(tree,n => n.type===Empty && n.props.smartPrintRows)[0].props;
  assert.deepEqual(exported.rows.map(row => row.props['data-report-asset']), ['a','c','b']);
  assert.equal(exported.reportGrouping, undefined);
  assert.equal(find(tree,n => n.props.className==='site-report-heading').length,0);
  const allSites = find(tree,n => n.type==='button' && find(n,c=>c.type==='strong' && c.props.children==='All sites').length)[0];
  assert.equal(allSites.props['aria-pressed'],false);
  header().props.onClick(); tree=render();
  exported = find(tree,n => n.type===Empty && n.props.smartPrintRows)[0].props;
  assert.deepEqual(exported.rows.map(row=>row.props['data-report-asset']),['b','c','a']);
  find(tree,n => n.type==='button' && find(n,c=>c.type==='strong' && c.props.children==='All sites').length)[0].props.onClick();
  tree=render();
  assert.equal(find(tree,n=>n.props.className==='site-report-heading').length,2);
});
