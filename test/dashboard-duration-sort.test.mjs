import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";
import { isDurationColumn, compareDurationValues } from "../src/duration-sort.mjs";
import { tableModel, selectTableRows, tableExportModel } from "../src/table-actions-model.mjs";
import { calculateBreakdownMinutes, durationLabelMinutes } from "../breakdown-duration.mjs";
import * as dateRanges from "../src/date-range-filter.mjs";

const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const h = React.createElement;
const source = main.slice(main.indexOf("function FilterableHeader("), main.indexOf("const EMPTY_TABLE_FILTER_VALUE ="));
const { code } = await transformWithOxc(source, "duration-menu.jsx", { jsx: { runtime: "classic" } });
const bindings = { React, isDurationColumn, ...dateRanges, CalendarDays: () => null, createPortal: (child) => child, document: { body: {} },
  useState: (initial) => [initial, () => {}], useRef: () => ({ current: null }), useEffect() {},
  matchesSmartSearch: () => true, ...Object.fromEntries(["ArrowUp", "ArrowDown", "ArrowUpDown", "X", "Search"].map((name) => [name, () => null])) };
const Header = new Function(...Object.keys(bindings), `${code}; return FilterableHeader;`)(...Object.values(bindings));
const descendants = (node, test) => Array.isArray(node) ? node.flatMap((item) => descendants(item, test))
  : React.isValidElement(node) ? [...(test(node) ? [node] : []), ...descendants(node.props.children, test)] : [];
function menu(props = {}) {
  const events = [];
  const tree = Header({ label: "Days of breakdown", sortKey: "breakdownDays", sort: {}, open: true,
    values: ["0d 0h 7m", "0d 0h 38m"], onFilterChange: (value) => events.push(["filter", value]),
    onSort: (...args) => events.push(["sort", ...args]), onToggle: (key) => events.push(["toggle", key]), ...props });
  return { tree, events, html: renderToStaticMarkup(tree) };
}

test("duration menus show clear sort choices instead of individual time values", () => {
  const { tree, events, html } = menu();
  assert.ok(html.includes("Lowest to highest time taken"));
  assert.ok(html.includes("Highest to lowest time taken"));
  for (const unwanted of ["Filter...", "All values", "0d 0h 7m", "0d 0h 38m"]) assert.ok(!html.includes(unwanted), unwanted);
  const buttons = descendants(tree, (node) => node.type === "button" && descendants(node, (child) => child.type === "span").length);
  buttons.find((button) => renderToStaticMarkup(button).includes("Lowest to highest")).props.onClick();
  assert.deepEqual(events.splice(0), [["filter", ""], ["sort", "breakdownDays", "asc"], ["toggle", "breakdownDays"]]);
  buttons.find((button) => renderToStaticMarkup(button).includes("Highest to lowest")).props.onClick();
  assert.deepEqual(events.splice(0), [["filter", ""], ["sort", "breakdownDays", "desc"], ["toggle", "breakdownDays"]]);
  buttons.find((button) => renderToStaticMarkup(button).includes("Clear sort")).props.onClick();
  assert.deepEqual(events, [["filter", ""], ["sort", "", "asc"], ["toggle", "breakdownDays"]]);
});

test("Reports keep their exact time filters; dates, status and meter readings are not duration menus", () => {
  const { html } = menu({ durationSortOnly: false });
  assert.ok(html.includes("Filter..."));
  assert.ok(html.includes("0d 0h 7m"));
  assert.ok(!html.includes("Lowest to highest time taken"));
  for (const label of ["Started", "First trip time", "Closing time", "Verified date & time", "Opening KMR/HMR", "Status"]) {
    assert.equal(isDurationColumn(label), false, label);
    assert.ok(menu({ label, sortKey: label }).html.includes("All values"));
  }
  for (const label of ["Days of breakdown", "Downtime", "Turn around time (TAT)", "Arrival delay", "Waiting when flagged", "Time taken"]) assert.equal(isDurationColumn(label), true, label);
  const report = main.slice(main.indexOf("function ReportTable("), main.indexOf("function ReportTable(") + 7000);
  assert.match(report, /durationSortOnly=\{false\}/);
  assert.match(report, /false, \/\/ Reports retain their existing sorting/);
});

test("fleet duration sort and export use actual times with missing values last", () => {
  const { columns } = tableModel(h("thead", {}, h("tr", {}, h("th", {}, "Days of breakdown"))));
  const rows = [["long", "2d 0h 0m", 2880], ["missing", "—", -1], ["hour", "0d 1h 0m", 60], ["short", "0d 0h 7m", 7], ["zero", "0d 0h 0m", 0], ["medium", "0d 0h 38m", 38]]
    .map(([key, text, raw]) => h("tr", { key }, h("td", { "data-sort-value": raw }, text)));
  const key = columns[0].key;
  assert.deepEqual(selectTableRows(rows, columns, {}, { key, direction: "asc" }).map((row) => row.key), ["zero", "short", "medium", "hour", "long", "missing"]);
  const expected = ["long", "hour", "medium", "short", "zero", "missing"];
  assert.deepEqual(selectTableRows(rows, columns, {}, { key, direction: "desc" }).map((row) => row.key), expected);
  assert.deepEqual(tableExportModel(rows, columns, [key], {}, { key, direction: "desc" }).rows.map((row) => row.key), expected);
  assert.equal(rows[0].key, "long", "source row order is unchanged");
  assert.ok(compareDurationValues("59m", "1h") < 0);
  assert.ok(compareDurationValues("23 hours", "1 day") < 0);
});

test("production, managers, maintenance and MIS sort within the same day and stop elapsed time at closure", () => {
  const now = Date.parse("2026-09-10T12:00:00+05:30");
  const rows = [
    { id: "hour", start: "2026-09-10 11:00:00" },
    { id: "missing" },
    { id: "short", start: "2026-09-10 11:53:00" },
    { id: "closed", start: "2026-09-09 10:00:00", closedAt: "2026-09-09 10:20:00" },
    { id: "medium", start: "2026-09-10 11:22:00" },
  ];
  const scopes = [main.slice(main.indexOf("function BreakdownTable("), main.indexOf("const masterFields =")),
    main.slice(main.indexOf("function MobileWorkflowTable("), main.indexOf("function RequestEditForm("))];
  for (const scope of scopes) {
    const expression = scope.match(/useSortableRows\((?:searchedRows|filteredRows), "", (\(row, key\) => .+)\);/)[1];
    const valueFor = new Function("calculateBreakdownMinutes", "durationLabelMinutes", "now", "breakdownNow", `return ${expression};`)(calculateBreakdownMinutes, durationLabelMinutes, now, now);
    assert.deepEqual([...rows].sort((a, b) => compareDurationValues(valueFor(a, "breakdownDays"), valueFor(b, "breakdownDays"))).map((row) => row.id), ["short", "closed", "medium", "hour", "missing"]);
  }
});
