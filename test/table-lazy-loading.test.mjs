import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { tableCellText, tableModel, tableSlots, selectTableRows } from "../src/table-actions-model.mjs";

const shared = readFileSync(new URL("../src/shared-actions-table.jsx", import.meta.url), "utf8");

test("desktop tables render in 100-row windows while phones keep 25", () => {
  assert.match(shared, /const DESKTOP_TABLE_PAGE_SIZE = 100;/);
  assert.match(shared, /mobileTablePageSize\(\) : 0\) \|\| DESKTOP_TABLE_PAGE_SIZE/);
});

test("the next window loads automatically as the end of the table nears", () => {
  assert.match(shared, /new IntersectionObserver\(/);
  assert.match(shared, /setVisibleRowLimit\(\(current\) => current \+ pageSize\)/);
  assert.match(shared, /rootMargin: "0px 0px 600px 0px"/);
  assert.match(shared, /className="mobile-table-window-status" role="status" ref=\{moreRowsRef\}/);
  assert.match(shared, /Show \{Math\.min\(pageSize, selectedRows\.length - renderedRowCount\)\} more/, "the explicit button remains as a fallback");
});

test("exports, print and counts still use every row, not only the rendered window", () => {
  assert.match(shared, /tableExportModel\(dataRows, columns, visible, localFilters, sort\)/);
  assert.match(shared, /\$\{selectedRows\.length\} of \$\{dataRows\.length\} records/);
});

test("row slots are computed once per element and cell text stays exact", () => {
  const h = React.createElement;
  const cell = h("td", {}, h("b", {}, "Door"), "7");
  const row = h("tr", {}, cell, h("td", {}, "Open"));
  assert.equal(tableCellText(cell), "Door 7");
  assert.equal(tableCellText(cell), "Door 7");
  assert.equal(tableSlots(row), tableSlots(row), "the same slot list is reused");
});

test("cached values keep sorting and filtering exact", () => {
  const h = React.createElement;
  const { columns } = tableModel([h("thead", { key: "h" }, h("tr", {}, h("th", {}, "Door"), h("th", {}, "Status")))]);
  const rows = ["D-3", "D-1", "D-2"].map((door, index) => h("tr", { key: door }, h("td", {}, door), h("td", {}, index === 1 ? "Closed" : "Open")));
  const sorted = selectTableRows(rows, columns, {}, { key: columns[0].key, direction: "asc" });
  assert.deepEqual(sorted.map((row) => tableCellText(tableSlots(row)[0].cell)), ["D-1", "D-2", "D-3"]);
  const open = selectTableRows(rows, columns, { [columns[1].key]: "Open" }, { key: "", direction: "asc" });
  assert.equal(open.length, 2);
});
