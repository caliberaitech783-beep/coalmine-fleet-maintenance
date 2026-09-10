import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {transformWithOxc} from "vite";
import * as model from "../src/dashboard-drilldown-model.mjs";
import {REGION_DATA} from "../region-scope.mjs";
import {calculateBreakdownMinutes, formatBreakdownDaysHours} from "../breakdown-duration.mjs";

const source = readFileSync(new URL("../src/dashboard-record-browser.jsx", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace("export default function", "function");
const {code} = await transformWithOxc(source, "record-browser.jsx", {jsx: {runtime: "classic"}});
const descendants = (node, test) => Array.isArray(node) ? node.flatMap((child) => descendants(child, test))
  : React.isValidElement(node) ? [...(test(node) ? [node] : []), ...descendants(node.props.children, test)] : [];

test("rendered table, region tabs, site totals and export scope stay consistent through filtering and reset", () => {
  const slots = [];
  let cursor = 0;
  const bindings = {React, ...model, calculateBreakdownMinutes, formatBreakdownDaysHours, useEffect() {}, useId: () => "test-records", useRef: () => ({current: null}),
    useState(initial) {const slot = cursor++; if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial; return [slots[slot], (next) => {slots[slot] = typeof next === "function" ? next(slots[slot]) : next;}];},
    ChevronLeft: () => null, ChevronRight: () => null, RotateCcw: () => null};
  const Component = new Function(...Object.keys(bindings), `${code}; return DashboardRecordBrowser;`)(...Object.values(bindings));
  const rows = Array.from({length: 475}, (_, id) => ({id: `R-${id}`, requestReference: `JOB-${id}`, requestSite: id < 469 ? "Sasti OB" : "Old workshop", category: "Vehicle"}));
  const props = {rows, regions: REGION_DATA, rowsAreScoped: true, requestRecords: true, title: "Recorded breakdown requests",
    Status: ({children}) => children, formatDate: (date) => date || "—", ActionsTable: ({children}) => React.createElement("table", null, children)};
  const render = () => {cursor = 0; return Component(props);};
  const verify = (tree, count, label) => {
    const table = descendants(tree, (node) => node.type === props.ActionsTable)[0];
    assert.equal(descendants(table, (node) => node.type === "tr").length - 1, count);
    assert.ok(table.props.exportTitle.endsWith(label));
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
});
