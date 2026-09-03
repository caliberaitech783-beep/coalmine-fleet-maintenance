import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import React from "react";
import {tableElements, tableCellText, tableModel, projectTableRow, tableSlots, selectTableRows} from "../src/table-actions-model.mjs";

const h = React.createElement;
const row = (key, ...cells) => h("tr", {key}, cells.map((value, i) => h("td", {key: i}, value)));
const headers = h("thead", {}, h("tr", {}, h("th", {}, "Name"), h("th", {}, "Count")));

test("table actions flatten conditional fragments and retain header filter callbacks", () => {
  const onFilterChange = () => {};
  const Header = () => null;
  const {columns} = tableModel(h("thead", {}, h("tr", {}, h(React.Fragment, {}, false, h(Header, {label:"Site", sortKey:"site", onFilterChange}), h("th", {}, "Actions")))));
  assert.deepEqual(columns.map(c => c.label), ["Site", "Actions"]);
  assert.equal(columns[0].header.props.onFilterChange, onFilterChange);
  assert.equal(tableCellText(h("input", {type:"checkbox", checked:true})), "Yes");
  assert.equal(tableCellText(h("input", {value:"Editable value"})), "Editable value");
});

test("table filters and numeric sort operate on rendered values without mutating source order", () => {
  const {columns} = tableModel(headers);
  const rows = [row("a", "Alpha", 10), row("b", "Beta", 2), row("c", "", 1)];
  assert.deepEqual(selectTableRows(rows, columns, {}, {key:columns[1].key, direction:"asc"}).map(r => r.key), ["c","b","a"]);
  assert.deepEqual(rows.map(r => r.key), ["a","b","c"]);
  assert.equal(selectTableRows(rows, columns, {[columns[0].key]:"Alpha"}, {}).length, 1);
  assert.equal(selectTableRows(rows, columns, {[columns[0].key]:"__empty_table_filter_value__"}, {})[0].key, "c");
  assert.equal(selectTableRows(rows, columns, {[columns[0].key]:"Missing"}, {}).length, 0);
  assert.deepEqual(selectTableRows(rows, columns, {}, {}).map(r => r.key), ["a","b","c"]);
});

test("column hiding and reordering preserve row events and interactive cells", () => {
  const onClick = () => {};
  const original = h("tr", {key:"record", onClick}, h("td", {}, "A"), h("td", {}, "B"), h("td", {}, h("button", {onClick}, "Edit")));
  const projected = projectTableRow(original, [2, 0]);
  assert.equal(projected.props.onClick, onClick);
  assert.equal(projected.key, "record");
  assert.deepEqual(tableSlots(projected).map(s => tableCellText(s.cell)), ["Edit", "A"]);
  assert.equal(tableElements(projected.props.children)[0].props.children.props.onClick, onClick);
});

test("grouped headers and empty-state colspan follow the displayed column order", () => {
  const group = h("tr", {}, h("th", {colSpan:2}, "Identity"), h("th", {colSpan:2}, "Sites"));
  const projected = projectTableRow(group, [2,0,3]);
  assert.deepEqual(tableElements(projected.props.children).map(c => [tableCellText(c), c.props.colSpan]), [["Sites",1],["Identity",1],["Sites",1]]);
  const empty = h("tr", {}, h("td", {colSpan:4}, "No records"));
  assert.equal(tableElements(projectTableRow(empty, [0,3]).props.children)[0].props.colSpan, 2);
});

test("every application table uses shared Actions or the existing Reports Actions", () => {
  const main = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const jsx = main.split(/\r?\n/).filter(line => !line.includes("printDocument.write")).join("\n");
  assert.equal((jsx.match(/<table(?=[ >])/g) || []).length, 1);
  assert.match(jsx, /<table className="report-filter-table">/);
  assert.ok((jsx.match(/<ActionsTable(?=[ >])/g) || []).length >= 17);
  assert.match(jsx, /resetLabel = "Reset report"/);
  const shared = fs.readFileSync(new URL("../src/shared-actions-table.jsx", import.meta.url), "utf8");
  for (const control of ["onColumns", "onFilter", "onSort", "onClearSort", "onReset"]) assert.ok(shared.includes(control));
  assert.match(shared, /resetLabel="Reset table"/);
});
