import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";
import { isDurationColumn, compareDurationValues, defaultDurationSort } from "../src/duration-sort.mjs";
import { tableModel, selectTableRows, tableExportModel } from "../src/table-actions-model.mjs";
import { calculateBreakdownMinutes, durationLabelMinutes } from "../breakdown-duration.mjs";
import { formatSessionDuration } from "../src/login-session-duration.mjs";
import { buildDepartmentReports } from "../department-reports.mjs";
import * as dateRanges from "../src/date-range-filter.mjs";
import * as multiFilters from "../src/multi-value-filter.mjs";

const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const h = React.createElement;
const source = main.slice(main.indexOf("function FilterableHeader("), main.indexOf("const EMPTY_TABLE_FILTER_VALUE ="));
const { code } = await transformWithOxc(source, "duration-menu.jsx", { jsx: { runtime: "classic" } });
const bindings = { React, isDurationColumn, ...dateRanges, ...multiFilters, EMPTY_TABLE_FILTER_VALUE: "__empty_table_filter_value__", CalendarDays: () => null, createPortal: (child) => child, document: { body: {} },
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
  assert.match(report, /defaultDurationSort\(columns\)/);
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
    const expression = scope.match(/useSortableRows\((?:searchedRows|filteredRows), defaultDurationSort\(filterColumns\), (\(row, key\) => .+)\);/)[1];
    const valueFor = new Function("calculateBreakdownMinutes", "durationLabelMinutes", "now", "breakdownNow", `return ${expression};`)(calculateBreakdownMinutes, durationLabelMinutes, now, now);
    assert.deepEqual([...rows].sort((a, b) => compareDurationValues(valueFor(a, "breakdownDays"), valueFor(b, "breakdownDays"))).map((row) => row.id), ["short", "closed", "medium", "hour", "missing"]);
  }
});

test("all duration tables default to descending, preferring breakdown days over other time columns", () => {
  for (const [key, label] of [["breakdownDays", "Days of breakdown"], ["hours", "Downtime"], ["tat", "TAT"], ["acceptedTime", "Arrival wait"], ["flagWaitingTime", "Waiting when flagged"], ["arrivalDelay", "Arrival delay"], ["prodToMis", "Prod to MIS verification"], ["maintToMis", "Maintenance close to MIS verification"], ["idleTime", "Idle to PM verification time"], ["misToFirstTrip", "MIS to first trip"], ["averageTat", "Average closure TAT"]]) {
    assert.deepEqual(defaultDurationSort([{ key: "start", label: "Started" }, { key, label }]), { key, direction: "desc" });
  }
  assert.deepEqual(defaultDurationSort([{ key: "acceptedTime", label: "Arrival wait" }, { key: "breakdownDays", label: "Days of breakdown" }]), { key: "breakdownDays", direction: "desc" });
  const { columns } = tableModel(h("thead", {}, h("tr", {}, h("th", {}, "Started"), h("th", {}, "Days of breakdown"))));
  assert.deepEqual(defaultDurationSort(columns), { key: columns[1].key, direction: "desc" });
  assert.deepEqual(defaultDurationSort([{ key: "start", label: "Started" }, { key: "openingMeter", label: "Opening KMR/HMR" }]), { key: "", direction: "asc" });
});

test("request and report sorting keeps manual ascending through live data updates and supports clear sort", () => {
  const source = main.slice(main.indexOf("function comparableValue("), main.indexOf("function SortableHeader("));
  let state;
  const bindings = { isDurationColumn, compareDurationValues, sortCollator: new Intl.Collator(undefined, { numeric: true }), useMemo: (fn) => fn(),
    useState(initial) { state ??= typeof initial === "function" ? initial() : initial; return [state, (next) => { state = typeof next === "function" ? next(state) : next; }]; } };
  const useRows = new Function(...Object.keys(bindings), `${source}; return useSortableRows;`)(...Object.values(bindings));
  for (const key of ["breakdownDays", "hours", "tat", "prodToMis"]) {
    state = undefined;
    const initial = defaultDurationSort([{ key }]);
    const rows = [{ id: "short", [key]: 7 }, { id: "missing", [key]: -1 }, { id: "long", [key]: 1440 }, { id: "medium", [key]: 38 }];
    let [sorted, sort, changeSort] = useRows(rows, initial);
    assert.deepEqual(sort, { key, direction: "desc" });
    assert.deepEqual(sorted.map(row => row.id), ["long", "medium", "short", "missing"]);
    changeSort(key, "asc");
    const updated = [...rows, { id: "hour", [key]: 60 }];
    [sorted, sort, changeSort] = useRows(updated, initial);
    assert.deepEqual(sort, { key, direction: "asc" });
    assert.deepEqual(sorted.map(row => row.id), ["short", "medium", "hour", "long", "missing"]);
    changeSort("", "asc");
    assert.deepEqual(useRows(updated, initial)[0], updated);
    changeSort(initial.key, initial.direction);
    assert.deepEqual(useRows(updated, initial)[0].map(row => row.id), ["long", "hour", "medium", "short", "missing"]);
  }
});

test("highest to lowest is selected in the duration menu by default", () => {
  const { tree, html } = menu({ sort: defaultDurationSort([{ key: "breakdownDays", label: "Days of breakdown" }]) });
  assert.match(html, /aria-sort="descending"/);
  const buttons = descendants(tree, (node) => node.type === "button");
  assert.equal(buttons.find(button => renderToStaticMarkup(button).includes("Highest to lowest")).props["aria-pressed"], true);
  assert.equal(buttons.find(button => renderToStaticMarkup(button).includes("Lowest to highest")).props["aria-pressed"], false);
});

test("login session duration defaults also sort hours, minutes and seconds numerically", () => {
  const { columns } = tableModel(h("thead", {}, h("tr", {}, h("th", {}, "Duration"))));
  const rows = [1000, null, 3601000, 3600000, 60000].map((milliseconds, index) => h("tr", { key: String(index) }, h("td", {}, formatSessionDuration(milliseconds))));
  assert.deepEqual(selectTableRows(rows, columns, {}, defaultDurationSort(columns)).map(row => row.key), ["2", "3", "4", "0", "1"]);
  assert.deepEqual(selectTableRows(rows, columns, {}, { ...defaultDurationSort(columns), direction: "asc" }).map(row => row.key), ["0", "4", "3", "2", "1"]);
});

test("audit duration defaults use raw milliseconds instead of formatted text", () => {
  const audit = main.slice(main.indexOf("function AuditTrailPage("), main.indexOf("function AuditTrailPage(") + 20000);
  const expression = audit.match(/useSortableRows\(filtered, defaultDurationSort\(filterColumns\), (\(event, key\) => .+)\);/)[1];
  const valueForKey = new Function("valueFor", `return ${expression};`)((event, key) => `${event[key]} ms`);
  const rows = [{ durationMs: 7 }, {}, { durationMs: 10000 }, { durationMs: 100 }];
  const initial = defaultDurationSort([{ key: "durationMs", label: "Duration" }]);
  assert.deepEqual(initial, { key: "durationMs", direction: "desc" });
  assert.deepEqual([...rows].sort((a, b) => compareDurationValues(valueForKey(a, initial.key), valueForKey(b, initial.key), initial.direction)).map(row => row.durationMs), [10000, 100, 7, undefined]);
});

test("generated duration reports all receive a descending default, including differently named duration columns", () => {
  const reports = buildDepartmentReports();
  for (const [title, key] of [["Turn Around Time for Repair", "tat"], ["Open Off road Cases", "days"], ["Availability Report", "breakdown"], ["30 Min. Mismatch", "difference"], ["Unverified Cases", "delay"], ["MIS Turn Around Time", "closeToMis"], ["Ticket Acceptance from Maintenance (Timelinewise)", "difference"], ["Maintenance Status Pending", "delay"], ["Vehicle Arrival Red Flag Report", "flagWaitingTime"], ["Summary Report", "waitingTat"]]) {
    const report = reports.find(report => report.title === title);
    assert.ok(report, title);
    assert.deepEqual(defaultDurationSort(report.columns), { key, direction: "desc" }, title);
  }
  const report = reports.find(report => report.title === "Total Fleet");
  assert.deepEqual(defaultDurationSort(report.columns), { key: "", direction: "asc" });
});
