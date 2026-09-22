import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";
import * as model from "../src/table-layouts.mjs";
import * as tableModel from "../src/table-actions-model.mjs";
import { defaultDurationSort } from "../src/duration-sort.mjs";
import { primaryRecordDateColumn } from "../src/record-date-range.mjs";
import { reportTime12 } from "../report-time-format.mjs";

const columns = ["door", "status", "model"].map(key => ({ key, label: key }));
const memory = () => {
  const data = new Map();
  return { data, getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
};

test("named layouts preserve hidden columns and exact order across reload, rename, update and delete", () => {
  const storage = memory(), key = model.tableLayoutStorageKey("operator", "Equipment", columns);
  const change = action => model.changeTableLayout(storage, key, columns, action);
  const first = change({ type: "save", name: "  Shift   summary ", keys: ["status", "door", "status"] });
  const second = change({ type: "save", name: "Models", keys: ["model", "door"] });
  assert.equal(second.layouts.length, 2);
  assert.deepEqual(model.readTableLayouts(storage, key, columns)[0], { id: first.selectedId, name: "Shift summary", keys: ["status", "door"] });
  change({ type: "rename", id: first.selectedId, name: "Day shift" });
  assert.deepEqual(model.readTableLayouts(storage, key, columns)[0].keys, ["status", "door"]);
  change({ type: "update", id: first.selectedId, keys: ["door"] });
  assert.equal(model.readTableLayouts(storage, key, columns)[0].name, "Day shift");
  assert.deepEqual(change({ type: "delete", id: second.selectedId }).layouts, [{ id: first.selectedId, name: "Day shift", keys: ["door"] }]);
});

test("layout names and selections are validated without changing saved data", () => {
  const storage = memory(), change = action => model.changeTableLayout(storage, "key", columns, action);
  change({ type: "save", name: "Daily", keys: ["door"] });
  const before = storage.getItem("key");
  for (const [action, message] of [
    [{ type: "save", name: " daily ", keys: ["status"] }, /already exists/],
    [{ type: "save", name: " ", keys: ["status"] }, /Enter a layout name/],
    [{ type: "rename", id: 1, name: "x".repeat(81) }, /80 characters/],
    [{ type: "save", name: "Empty", keys: ["unknown"] }, /at least one column/],
    [{ type: "update", id: 1, keys: [] }, /at least one column/],
    [{ type: "rename", id: 99, name: "Missing" }, /no longer exists/],
  ]) assert.throws(() => change(action), message);
  assert.equal(storage.getItem("key"), before);
  change({ type: "save", name: "Second", keys: ["model"] });
  assert.throws(() => change({ type: "rename", id: 2, name: "DAILY" }), /already exists/);
});

test("layouts stay separate by account and table schema and survive default-order changes", () => {
  const key = model.tableLayoutStorageKey("Operator", "Equipment", columns);
  assert.equal(key, model.tableLayoutStorageKey(" operator ", "Equipment", [...columns].reverse()));
  assert.notEqual(key, model.tableLayoutStorageKey("someone else", "Equipment", columns));
  assert.notEqual(key, model.tableLayoutStorageKey("operator", "Requests", columns));
  assert.notEqual(key, model.tableLayoutStorageKey("operator", "Equipment", columns.slice(1)));
  assert.ok(!key.startsWith("bdms:smart-print:"));
  assert.throws(() => model.tableLayoutStorageKey("", "Equipment", columns), /Sign in/);
});

test("malformed entries, stale keys and failed writes cannot produce an empty saved table", () => {
  const storage = memory();
  storage.setItem("key", JSON.stringify([null, {}, { id: 1, name: "Valid", keys: ["unknown", "status", "status", "door"] }, { id: 1, name: "Duplicate", keys: ["door"] }, { id: 2, name: "Stale", keys: ["gone"] }]));
  assert.deepEqual(model.readTableLayouts(storage, "key", columns), [{ id: 1, name: "Valid", keys: ["status", "door"] }]);
  const before = storage.getItem("key");
  assert.throws(() => model.changeTableLayout({ ...storage, setItem() { throw Error("Quota exceeded"); } }, "key", columns, { type: "rename", id: 1, name: "Changed" }), /Quota exceeded/);
  assert.equal(storage.getItem("key"), before);
  storage.setItem("key", "bad JSON");
  assert.throws(() => model.readTableLayouts(storage, "key", columns));
});

const descendants = (node, predicate) => Array.isArray(node) ? node.flatMap(child => descendants(child, predicate))
  : React.isValidElement(node) ? [...(predicate(node) ? [node] : []), ...descendants(node.props.children, predicate)] : [];
const content = node => Array.isArray(node) ? node.map(content).join("") : React.isValidElement(node) ? content(node.props.children) : typeof node === "string" ? node : "";
const Null = () => null;
async function harness(source, component, bindings) {
  let cursor = 0;
  const slots = [];
  const scope = { React, useEffect() {}, useMemo: fn => fn(), useRef: () => ({ current: null }),
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial; return [slots[index], next => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }]; }, ...bindings };
  const { code } = await transformWithOxc(source, "table-layout-test.jsx", { jsx: { runtime: "classic" } });
  const Component = new Function(...Object.keys(scope), `${code}; return ${component};`)(...Object.values(scope));
  return props => { cursor = 0; return Component(props); };
}

test("column dialog controls save, rename and update a selected layout without applying unsaved draft edits", async () => {
  const source = readFileSync(new URL("../src/table-layouts.jsx", import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "").replaceAll("export function", "function");
  const render = await harness(source, "TableLayoutControls", model);
  const storage = memory(), store = { layouts: [], error: "", change(action) { const result = model.changeTableLayout(storage, "key", columns, action); this.layouts = result.layouts; return result.selectedId; } };
  let draftKeys = ["status", "door"], props = () => ({ store, draftKeys, defaultKeys: columns.map(c => c.key), onSelect: keys => { draftKeys = keys; } });
  let tree;
  const draw = () => tree = render(props());
  const click = label => { descendants(tree, node => node.type === "button" && content(node) === label)[0].props.onClick(); draw(); };
  const nameAndSubmit = name => { descendants(tree, node => node.type === "input")[0].props.onChange({ target: { value: name } }); draw(); descendants(tree, node => node.type === "form")[0].props.onSubmit({ preventDefault() {} }); draw(); };
  draw(); click("Save as new layout"); nameAndSubmit("Shift");
  assert.deepEqual(store.layouts[0].keys, ["status", "door"]);
  click("Rename"); nameAndSubmit("Renamed shift");
  assert.equal(store.layouts[0].name, "Renamed shift");
  draftKeys = ["model"]; draw(); click("Update layout");
  assert.deepEqual(store.layouts[0].keys, ["model"]);
  click("Default columns"); assert.deepEqual(draftKeys, ["door", "status", "model"]);
  assert.equal(store.layouts.length, 1, "resetting columns does not delete presets");
  descendants(tree, node => node.type === "select")[0].props.onChange({ target: { value: "1" } }); draw();
  assert.deepEqual(draftKeys, ["model"]);
  assert.match(renderToStaticMarkup(tree), /Saved table layouts/);
});

test("switching a shared table layout immediately projects headings, rows and exports in saved order", async () => {
  const source = readFileSync(new URL("../src/shared-actions-table.jsx", import.meta.url), "utf8");
  const h = React.createElement;
  const children = [h("thead", {}, h("tr", {}, h("th", {}, "Door"), h("th", {}, "Status"), h("th", {}, "Model"))), h("tbody", {}, h("tr", {}, h("td", {}, "D-1"), h("td", {}, "Open"), h("td", {}, "M-1")))];
  const { sections, columns: tableColumns } = tableModel.tableModel(children);
  const layoutScopes = [];
  const render = await harness(source.slice(source.indexOf("function TableView(")), "TableView", { ...tableModel, defaultDurationSort, primaryRecordDateColumn,
    sharedTablePageSize: () => 0, useTableLayouts: key => { layoutScopes.push(key); return { layouts: [] }; }, TableLayoutSelect: Null,
    isDataRow: row => tableModel.tableElements(row.props.children).length > 1, RecordDateRange: Null, ArrowUpDown: Null, ArrowUp: Null, ArrowDown: Null });
  const props = { sections, columns: tableColumns, Menu: Null, ColumnsDialog: Null, SortDialog: Null, FilterDialog: Null, ExportMenu: Null, exportTitle: "Equipment", tableProps: {}, recordDateFilter: false, showRowNumbers: true };
  let tree = render(props);
  const picker = descendants(tree, node => node.props.visibleKeys)[0];
  picker.props.onSelect([tableColumns[2].key, tableColumns[0].key]);
  tree = render(props);
  const actualTable = descendants(tree, node => node.type === "table")[0];
  assert.deepEqual(descendants(actualTable, node => node.type === "th").map(content), ["Sr. No.", "Model", "Door"]);
  assert.deepEqual(descendants(actualTable, node => node.type === "td").slice(1).map(content), ["M-1", "D-1"]);
  const exported = descendants(tree, node => node.props.title === "Equipment" && node.props.smartPrintColumns)[0];
  assert.deepEqual(exported.props.columns.map(c => c.label), ["Sr. No.", "Model", "Door"]);
  assert.equal(exported.props.rows.length, 1);
  props.exportTitle = "Equipment at another site";
  render(props);
  assert.equal(new Set(layoutScopes).size, 1, "a site/date title change keeps the same saved layouts available");
});

test("Reports tables apply the same saved column order through their controlled view", async () => {
  const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  let capturedKey;
  const render = await harness(main.slice(main.indexOf("function ReportTable("), main.indexOf("function parseCsv(")), "ReportTable", {
    defaultDurationSort, reportTime12, mobileTablePageSize: () => 0, tableFilterText: value => String(value || ""),
    sortCollator: new Intl.Collator(), matchesSmartSearch: () => true, tableRowMatchesFilters: () => true,
    useSortableRows: rows => [rows, { key: "", direction: "asc" }, () => {}],
    useTableLayouts: key => { capturedKey = key; return { layouts: [] }; }, TableLayoutSelect: Null,
    ensureJobReferenceVisibleKeys: tableModel.ensureJobReferenceVisibleKeys,
    ReportActionsMenu: Null, SavedReportsPanel: Null, FilterableHeader: Null, TableParameterFilter: Null,
    ReportColumnSelector: Null, ReportSortDialog: Null, ListFilter: Null, ChevronLeft: Null, ChevronRight: Null,
  });
  const props = { layoutKey: "Equipment report", columns: columns.map(column => ({ ...column, value: row => row[column.key] })), rows: [{ door: "D-1", status: "Open", model: "M-1" }],
    visibleColumnKeys: ["door", "status", "model"], onVisibleColumnsChange: keys => { props.visibleColumnKeys = keys; } };
  let tree = render(props);
  descendants(tree, node => node.props.visibleKeys)[0].props.onSelect(["model", "door"]);
  tree = render(props);
  assert.equal(capturedKey, "Equipment report");
  const table = descendants(tree, node => node.type === "table")[0];
  assert.deepEqual(descendants(table, node => node.props.sortKey).map(node => node.props.label), ["model", "door"]);
  assert.deepEqual(descendants(table, node => node.type === "td").slice(1).map(content), ["M-1", "D-1"]);
});
