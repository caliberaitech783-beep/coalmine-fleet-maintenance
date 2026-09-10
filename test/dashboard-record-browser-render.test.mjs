import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {transformWithOxc} from "vite";
import * as model from "../src/dashboard-drilldown-model.mjs";
import {REGION_DATA} from "../region-scope.mjs";
import {calculateBreakdownMinutes, formatBreakdownDaysHours} from "../breakdown-duration.mjs";
import {requestStatusSortRank} from "../src/request-status.mjs";
import {filterRecordsByDate} from "../src/record-date-range.mjs";
import {formatDisplayDateTime} from "../date-time-format.mjs";
import {tableModel, dateColumnsFirst, tableExportModel} from "../src/table-actions-model.mjs";

const source = readFileSync(new URL("../src/dashboard-record-browser.jsx", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace("export default function", "function");
const {code} = await transformWithOxc(source, "record-browser.jsx", {jsx: {runtime: "classic"}});
const descendants = (node, test) => Array.isArray(node) ? node.flatMap((child) => descendants(child, test))
  : React.isValidElement(node) ? [...(test(node) ? [node] : []), ...descendants(node.props.children, test)] : [];

test("BD Out closing times, table order, counts and exports stay consistent through region filtering and reset", () => {
  const slots = [];
  let cursor = 0;
  const bindings = {React, ...model, calculateBreakdownMinutes, formatBreakdownDaysHours, requestStatusSortRank, filterRecordsByDate, useEffect() {}, useId: () => "test-records", useRef: () => ({current: null}),
    useState(initial) {const slot = cursor++; if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial; return [slots[slot], (next) => {slots[slot] = typeof next === "function" ? next(slots[slot]) : next;}];},
    ChevronLeft: () => null, ChevronRight: () => null, RotateCcw: () => null};
  const Component = new Function(...Object.keys(bindings), `${code}; return DashboardRecordBrowser;`)(...Object.values(bindings));
  const rows = Array.from({length: 475}, (_, id) => ({id: `R-${id}`, requestReference: `JOB-${id}`, requestSite: id < 469 ? "Sasti OB" : "Old workshop", category: "Vehicle",
    requestStatus: "Closed", requestStart: "2026-09-10 10:00:00", requestClosed: id === 474 ? "—" : "2026-09-10T05:30:00Z"}));
  const props = {rows, regions: REGION_DATA, rowsAreScoped: true, requestRecords: true, showBdClosingTime: true, title: "BD Out",
    Status: ({children}) => children, formatDate: formatDisplayDateTime, ActionsTable: ({children}) => React.createElement("table", null, children)};
  const render = () => {cursor = 0; return Component(props);};
  const verify = (tree, count, label) => {
    const table = descendants(tree, (node) => node.type === props.ActionsTable)[0];
    assert.equal(descendants(table, (node) => node.type === "tr").length - 1, count);
    assert.ok(table.props.exportTitle.endsWith(label));
    assert.equal(table.props.printTitle, table.props.exportTitle);
    const columns = dateColumnsFirst(tableModel(table.props.children).columns);
    assert.deepEqual(columns.slice(0, 3).map(column => column.label), ["Status", "Started", "BD closing time"]);
    const dataRows = descendants(descendants(table, node => node.type === "tbody"), node => node.type === "tr");
    const exported = tableExportModel(dataRows, columns, columns.map(column => column.key));
    assert.equal(exported.rows.length, count);
    const closing = exported.columns.find(column => column.label === "BD closing time");
    assert.equal(closing.value(exported.rows[0]), "10-09-2026 11:00:00 AM");
    if (label !== "WCL") assert.equal(closing.value(exported.rows.at(-1)), "Not recorded");
    // Render the real children as well, including all FilterTabRow controls.
    const html = renderToStaticMarkup(tree);
    assert.ok(html.includes(`${count} of ${count} records`));
    assert.equal((html.match(/<b>JOB-/g) || []).length, count);
  };
  let tree = render(); verify(tree, 475, "All regions");
  descendants(tree, (node) => node.props.role === "tab" && node.props.id === "test-records-WCL")[0].props.onClick();
  tree = render(); verify(tree, 469, "WCL");
  descendants(tree, (node) => node.props.role === "tab" && node.props.id === "test-records-unmapped")[0].props.onClick();
  tree = render(); verify(tree, 6, "Other / unassigned");
  descendants(tree, (node) => node.props.className === "dashboard-record-reset")[0].props.onClick();
  tree = render(); verify(tree, 475, "All regions");
  // Date filtering happens before the region/site counts and before Print/Export receive rows.
  rows[0].requestStart = "2026-09-09 23:59:59";
  rows[474].requestStart = "—";
  descendants(tree, (node) => node.type === props.ActionsTable)[0].props.recordDateFilter.onChange("__date_range__:2026-09-10|2026-09-10");
  tree = render();
  let datedTable = descendants(tree, (node) => node.type === props.ActionsTable)[0];
  assert.equal(descendants(datedTable, node => node.type === "tr").length - 1, 473);
  assert.match(renderToStaticMarkup(tree), /473 of 473 records/);
  datedTable.props.recordDateFilter.onChange("__date_range__:2026-09-12|2026-09-12");
  tree = render();
  assert.match(renderToStaticMarkup(tree), /0 of 0 records/);
  descendants(tree, (node) => node.type === props.ActionsTable)[0].props.recordDateFilter.onChange("");
  tree = render(); verify(tree, 475, "All regions");
  props.showBdClosingTime = false;
  assert.doesNotMatch(renderToStaticMarkup(render()), /<th>BD closing time<\/th>/);
});
