import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { createPortal } from "react-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";
import * as drilldown from "../src/dashboard-drilldown-model.mjs";
import * as tableModel from "../src/table-actions-model.mjs";
import * as recordDates from "../src/record-date-range.mjs";
import * as dateRanges from "../src/date-range-filter.mjs";
import { calculateBreakdownMinutes, formatBreakdownDaysHours } from "../breakdown-duration.mjs";
import { requestStatusSortRank } from "../src/request-status.mjs";
import { formatDisplayDateTime } from "../date-time-format.mjs";
import { reportTime12 } from "../report-time-format.mjs";
import { REGION_DATA } from "../region-scope.mjs";

const h = React.createElement;
const names = { "dashboard-record-browser": "DashboardRecordBrowser", "shared-actions-table": "SharedActionsTable", "record-date-range": "RecordDateRange" };
const compiled = Object.fromEntries(await Promise.all(Object.entries(names).map(async ([file, name]) => {
  const source = readFileSync(new URL(`../src/${file}.jsx`, import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "").replace("export default function", "function");
  return [file, (await transformWithOxc(source, `${file}.jsx`, { jsx: { runtime: "classic" } })).code + `; return ${name};`];
})));
const empty = () => null;
const bindings = { React, createPortal, ...drilldown, ...tableModel, ...recordDates, ...dateRanges, calculateBreakdownMinutes, formatBreakdownDaysHours, requestStatusSortRank,
  useState: React.useState, useEffect: React.useEffect, useMemo: React.useMemo, useId: React.useId, useRef: React.useRef,
  ChevronLeft: empty, ChevronRight: empty, RotateCcw: empty, ArrowDown: empty, ArrowUp: empty, ArrowUpDown: empty };
const load = (file, overrides = {}) => {
  const values = { ...bindings, ...overrides };
  return new Function(...Object.keys(values), compiled[file])(...Object.values(values));
};
const RecordDateRange = load("record-date-range");
const nodes = (node, predicate) => Array.isArray(node) ? node.flatMap(child => nodes(child, predicate))
  : React.isValidElement(node) ? [...(predicate(node) ? [node] : []), ...nodes(node.props.children, predicate)] : [];
const one = (tree, predicate) => { const found = nodes(tree, predicate); assert.equal(found.length, 1); return found[0]; };

// The repository's JSX tests drive rendered callbacks with a small hook host;
// production filtering, projection and export models all run unchanged.
function interactive(file, props) {
  const slots = [];
  let cursor = 0;
  const Component = load(file, { RecordDateRange, useEffect() {}, useMemo: fn => fn(), useId: () => "linked-records", useRef: () => ({ current: null }),
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], next => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
    } });
  return () => {
    cursor = 0;
    const tree = Component(props);
    return file === "shared-actions-table" ? tree.type(tree.props) : tree;
  };
}

const records = [
  { id: "a", requestReference: "JOB-A", requestSite: "Sasti OB", category: "Vehicle", group: "SCANIA TIPPERS", door: "T10", requestStart: "2026-09-01 10:00:00" },
  { id: "b", requestReference: "JOB-B", requestSite: "Sasti OB", category: "Equipment", group: "EXCAVATOR", door: "E2", requestStart: "2026-09-10 10:00:00" },
  { id: "c", requestReference: "JOB-C", requestSite: "Jayant OB", category: "Vehicle", group: "SCANIA TIPPERS", door: "T2", requestStart: "2026-09-12 10:00:00" },
];
const ActionsTable = ({ children }) => h("table", null, children);
const browserProps = () => ({ rows: records, regions: REGION_DATA, rowsAreScoped: true, requestRecords: true, ActionsTable, Status: ({ children }) => children, formatDate: formatDisplayDateTime });
const browserTable = tree => one(tree, node => node.type === ActionsTable);
const browserJobs = tree => nodes(browserTable(tree), node => node.type === "tbody").flatMap(body => nodes(body, node => node.type === "b")).map(node => node.props.children).filter(value => String(value).startsWith("JOB-"));
test("parent-filtered rows update live without a hidden hierarchy or a second grid row", () => {
  const props = { ...browserProps(), initialRegion: "NCL", initialSite: "Jayant OB", hideHierarchyFilters: true, rows: records.slice(0, 2) };
  const render = interactive("dashboard-record-browser", props);
  let tree = render();
  assert.deepEqual(browserJobs(tree), ["JOB-A", "JOB-B"]);
  const html = renderToStaticMarkup(tree);
  assert.doesNotMatch(html, /<h4>All regions requests<\/h4>/);
  assert.doesNotMatch(html, /role="tablist"|data-level=|aria-labelledby=|<details/);
  assert.match(html, /grid-template-rows:minmax\(0, 1fr\)/);
  assert.equal(React.Children.toArray(tree.props.children).length, 1);
  props.summaryLabel = "WCL · Sasti OB requests";
  tree = render();
  assert.match(renderToStaticMarkup(tree), /<h4>WCL · Sasti OB requests<\/h4>/);
  assert.deepEqual(browserJobs(tree), ["JOB-A", "JOB-B"]);
  props.rows = records.slice(2);
  props.summaryLabel = "NCL · Jayant OB requests";
  tree = render();
  assert.deepEqual(browserJobs(tree), ["JOB-C"]);
  assert.match(renderToStaticMarkup(tree), /<h4>NCL · Jayant OB requests<\/h4>/);
  props.rows = [];
  assert.deepEqual(browserJobs(render()), []);
  props.rows = records;
  assert.deepEqual(browserJobs(render()), ["JOB-A", "JOB-B", "JOB-C"]);
  props.hideHierarchyFilters = false;
  props.summaryLabel = "";
  tree = render();
  assert.equal(tree.props.style, undefined);
  assert.match(renderToStaticMarkup(tree), /<details/);
  assert.doesNotMatch(renderToStaticMarkup(tree), /<h4>NCL requests<\/h4>/);
  assert.deepEqual(browserJobs(tree), ["JOB-C"], "default private hierarchy still honors initial selection");
});

test("disabling Started filtering ignores an already-applied range and forwards row numbering", () => {
  const props = browserProps();
  const render = interactive("dashboard-record-browser", props);
  let table = browserTable(render());
  assert.equal(table.props.showRowNumbers, true);
  assert.equal(table.props.recordDateFilter.label, "Started");
  table.props.recordDateFilter.onChange("__date_range__:2026-09-10|2026-09-10");
  assert.deepEqual(browserJobs(render()), ["JOB-B"]);
  props.showDateFilter = false;
  props.showRowNumbers = true;
  const tree = render();
  table = browserTable(tree);
  assert.equal(table.props.recordDateFilter, false);
  assert.equal(table.props.disableDateColumnFilter, true);
  assert.equal(table.props.showRowNumbers, true);
  assert.deepEqual(browserJobs(tree), ["JOB-A", "JOB-B", "JOB-C"]);
  assert.doesNotMatch(renderToStaticMarkup(tree), /3 of 3 records/);
  assert.equal(table.props.toolbarPortal, true);
});

const Menu = () => null, FilterDialog = () => null, ColumnsDialog = () => null, SortDialog = () => null, ExportMenu = () => null;
const sharedProps = () => ({ Menu, FilterDialog, ColumnsDialog, SortDialog, ExportMenu, exportTitle: "OEM records", printTitle: "OEM records", showRowNumbers: true, preserveColumnOrder: true,
  children: [h("thead", { key: "head" }, h("tr", null, ["Machine", "Status", "Started"].map(label => h("th", { key: label }, label)))),
    h("tbody", { key: "body" }, [["T10", "Open", "2026-09-01"], ["T2", "Open", "2026-09-12"], ["E1", "Closed", "2026-09-10"]].map((values, index) => h("tr", { key: index }, values.map((value, i) => h("td", { key: i }, value))))) ] });
const bodyValues = tree => nodes(tree, node => node.type === "tbody").flatMap(body => nodes(body, node => node.type === "tr")).map(row => tableModel.tableElements(row.props.children).map(tableModel.tableCellText));
const exportValues = menu => menu.props.rows.map(row => menu.props.columns.map(column => reportTime12(String(column.value(row)))));
const assertExportsMatch = tree => {
  for (const menu of nodes(tree, node => node.type === ExportMenu)) {
    assert.deepEqual(exportValues(menu), bodyValues(tree));
    assert.equal(menu.props.smartPrintColumns[0].label, "Sr. No.");
    assert.deepEqual(menu.props.smartPrintRows.map(row => menu.props.smartPrintColumns[0].value(row)), menu.props.rows.map((_, i) => i + 1));
  }
};

test("rendered row sequence and all export/print models follow sorting, filtering, columns and reset", () => {
  const props = sharedProps(), render = interactive("shared-actions-table", props);
  let tree = render();
  assert.equal(bodyValues(tree)[0][0], "1");
  assert.doesNotMatch(renderToStaticMarkup(tree), /showRowNumbers=/);
  one(tree, node => node.props.title === "Sort by Machine").props.onClick();
  tree = render();
  assert.deepEqual(bodyValues(tree).map(row => row.slice(0, 2)), [["1", "E1"], ["2", "T2"], ["3", "T10"]]);
  let filter = one(tree, node => node.type === FilterDialog);
  assert.ok(!filter.props.columns.some(column => column.label === "Sr. No."));
  filter.props.onFilterChange(filter.props.columns.find(column => column.label === "Status").key, "Open");
  tree = render();
  assert.deepEqual(bodyValues(tree).map(row => row.slice(0, 2)), [["1", "T2"], ["2", "T10"]]);
  assertExportsMatch(tree);
  one(tree, node => node.props.title === "Sort by Machine").props.onClick();
  tree = render();
  assert.deepEqual(bodyValues(tree).map(row => row.slice(0, 2)), [["1", "T10"], ["2", "T2"]]);
  one(tree, node => node.type === Menu).props.onColumns();
  const columns = one(render(), node => node.type === ColumnsDialog);
  columns.props.onApply(["Status", "Machine"].map(label => columns.props.columns.find(column => column.label === label).key));
  tree = render();
  assert.deepEqual(bodyValues(tree), [["1", "Open", "T10"], ["2", "Open", "T2"]]);
  assertExportsMatch(tree);
  filter = one(tree, node => node.type === FilterDialog);
  filter.props.onFilterChange(filter.props.columns.find(column => column.label === "Status").key, "Missing");
  tree = render();
  assert.match(renderToStaticMarkup(tree), /colSpan="3" class="empty-state">No matching records/);
  for (const menu of nodes(tree, node => node.type === ExportMenu)) assert.deepEqual(menu.props.rows, []);
  one(tree, node => node.type === Menu).props.onReset();
  tree = render();
  assert.deepEqual(bodyValues(tree).map(row => row.slice(0, 2)), [["1", "T10"], ["2", "T2"], ["3", "E1"]]);
  assertExportsMatch(tree);
  props.showRowNumbers = false;
  tree = render();
  assert.equal(bodyValues(tree)[0][0], "T10");
  assert.doesNotMatch(renderToStaticMarkup(tree), />Sr\. No\.</);
  assertExportsMatchWithoutNumbers(tree);
});

function assertExportsMatchWithoutNumbers(tree) {
  for (const menu of nodes(tree, node => node.type === ExportMenu)) assert.deepEqual(exportValues(menu), bodyValues(tree));
}

test("date suppression removes Started controls and stale filters while retaining Started sorting", () => {
  const FilterableHeader = ({ label }) => h("th", null, label);
  const props = { ...sharedProps(), FilterableHeader }, render = interactive("shared-actions-table", props);
  let tree = render();
  one(tree, node => node.type === RecordDateRange).props.onChange("__date_range__:2026-09-10|2026-09-10");
  assert.equal(bodyValues(render()).length, 1);
  props.recordDateFilter = false;
  assert.equal(bodyValues(render()).length, 1, "hiding only the toolbar preserves existing column filters for other screens");
  props.disableDateColumnFilter = true;
  tree = render();
  assert.equal(bodyValues(tree).length, 3);
  assert.equal(nodes(tree, node => node.type === RecordDateRange).length, 0);
  assert.equal(nodes(tree, node => node.type === FilterableHeader && node.props.label === "Started").length, 0);
  assert.ok(!one(tree, node => node.type === FilterDialog).props.columns.some(column => column.label === "Started"));
  assert.equal(one(tree, node => node.type === Menu).props.activeFilterCount, 0);
  one(tree, node => node.props.title === "Sort by Started").props.onClick();
  tree = render();
  assert.deepEqual(bodyValues(tree).map(row => row.slice(0, 2)), [["1", "T10"], ["2", "E1"], ["3", "T2"]]);
  assertExportsMatch(tree);
});

test("numbers span multiple bodies, grouped headings, empty rows and print-only tables", () => {
  const props = sharedProps();
  props.exportTitle = "";
  props.children.unshift(h("colgroup", { key: "widths" }, [1, 2, 3].map(key => h("col", { key }))));
  const head = props.children[1];
  props.children[1] = React.cloneElement(head, {}, h("tr", { key: "group" }, h("th", { colSpan: 3 }, "Records")), head.props.children);
  props.children.push(h("tbody", { key: "second" }, h("tr", null, h("td", null, "T1"), h("td", null, "Open"), h("td", null, "2026-09-13"))));
  const render = interactive("shared-actions-table", props);
  let tree = render();
  one(tree, node => node.props.title === "Sort by Machine").props.onClick();
  tree = render();
  assert.deepEqual(bodyValues(tree).map(row => row[0]), ["1", "2", "3", "4"]);
  assertExportsMatch(tree);
  assert.equal(one(tree, node => node.type === "th" && node.props.children === "Sr. No.").props.rowSpan, 2);
  assert.equal(nodes(tree, node => node.type === "col").length, 4);
  props.children = [sharedProps().children[0], h("tbody", { key: "empty" }, h("tr", null, h("td", { colSpan: 3 }, "No records")))];
  tree = render();
  assert.match(renderToStaticMarkup(tree), /colSpan="4">No records/);
  assert.deepEqual(one(tree, node => node.type === ExportMenu).props.rows, []);
});

test("the real browser and shared table render OEM controls and numbered exports together", () => {
  const Shared = load("shared-actions-table", { RecordDateRange }), Browser = load("dashboard-record-browser");
  const exports = [];
  const CaptureExport = props => { exports.push(props); return null; };
  // Static rendering has no DOM portal target; render the toolbar inline for this integration test.
  const Wrapper = props => h(Shared, { ...sharedProps(), ...props, toolbarPortal: false, ExportMenu: CaptureExport });
  const html = renderToStaticMarkup(h(Browser, { ...browserProps(), rows: records.filter(row => row.category === "Vehicle"), ActionsTable: Wrapper, title: "OEM", hideHierarchyFilters: true, showDateFilter: false, showRowNumbers: true }));
  assert.doesNotMatch(html, /type="date"|role="tablist"|data-level="site"/);
  assert.match(html, /<th class="table-serial-header" scope="col">Sr\. No\.<\/th>/);
  assert.match(html, /<td class="table-serial-cell">1<\/td>/);
  assert.match(html, /<td class="table-serial-cell">2<\/td>/);
  assert.equal(exports.length, 2);
  for (const model of exports) {
    assert.deepEqual(model.rows.map(row => model.columns[0].value(row)), [1, 2]);
    assert.deepEqual(model.rows.map(row => model.columns.find(column => column.label === "Job reference").value(row)), ["JOB-A", "JOB-C"]);
  }
  for (const requestRecords of [true, false]) {
    exports.length = 0;
    const props = { ...browserProps(), rows: [records[0]], ActionsTable: Wrapper, requestRecords,
      hideHierarchyFilters: true, showDateFilter: false, showRowNumbers: true, hideSiteColumn: true, summaryLabel: "WCL · Sasti OB" };
    const siteHtml = renderToStaticMarkup(h(Browser, props));
    assert.match(siteHtml, /<h4>WCL · Sasti OB<\/h4>/);
    assert.doesNotMatch(siteHtml, /Request site|Current location/);
    const columnCount = requestRecords ? 13 : 9;
    for (const model of exports) {
      assert.equal(model.columns.length, columnCount, "site column is removed from numbered print/export models");
      assert.ok(!model.columns.some(column => ["Request site", "Current location"].includes(column.label)));
      assert.equal(model.columns[0].value(model.rows[0]), 1);
      assert.equal(model.columns.find(column => column.label === "Machine / Door no.").value(model.rows[0]), "T10");
    }
    const emptyHtml = renderToStaticMarkup(h(Browser, { ...props, rows: [] }));
    assert.ok(emptyHtml.includes(`colSpan="${columnCount}"`), "empty state spans the visible numbered columns");
  }
});
