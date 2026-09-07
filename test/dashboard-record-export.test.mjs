import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { drilldownView } from "../src/dashboard-drilldown-model.mjs";
import { tableModel, tableExportModel } from "../src/table-actions-model.mjs";
import { REGION_DATA } from "../region-scope.mjs";

const h = React.createElement;

test("chart exports respect region, cascading filters, table filters, sort and displayed columns", () => {
  const records = [
    { id: 1, currentLocation: "Sasti OB", category: "Vehicle", door: "T10", status: "Closed" },
    { id: 2, currentLocation: "Sasti OB", category: "Vehicle", door: "T2", status: "Closed" },
    { id: 3, currentLocation: "Sasti OB", category: "Vehicle", door: "T1", status: "Open" },
    { id: 4, currentLocation: "Jayant OB", category: "Vehicle", door: "N1", status: "Closed" },
    { id: 5, currentLocation: "Sasti OB", category: "Equipment", door: "E1", status: "Closed" },
    { id: 6, currentLocation: "Majri OB", category: "Vehicle", door: "M1", status: "Closed" },
  ];
  const view = drilldownView(records, REGION_DATA, { region: "WCL", site: "Sasti OB", category: "Total vehicles" });
  const { columns } = tableModel(h("thead", {}, h("tr", {}, ...["Machine", "Site", "Status"].map((label) => h("th", { key: label }, label)))));
  const rows = view.rows.map((record) => h("tr", { key: record.id }, h("td", {}, h("b", {}, record.door)), h("td", {}, record.currentLocation), h("td", {}, record.status)));
  const exported = tableExportModel(rows, columns, [columns[1].key, columns[0].key], { [columns[2].key]: "Closed" }, { key: columns[0].key, direction: "asc" });
  assert.deepEqual(exported.columns.map(({ label }) => label), ["Site", "Machine"]);
  assert.deepEqual(exported.rows.map((row) => exported.columns.map((column) => column.value(row))), [["Sasti OB", "T2"], ["Sasti OB", "T10"]]);
  assert.deepEqual(rows.map((row) => row.key), ["1", "2", "3"]);
  assert.deepEqual(tableExportModel(rows, columns, [columns[0].key], { [columns[2].key]: "Missing" }).rows, []);
});

test("chart detail lists opt into the existing PDF, Excel and Print menu", () => {
  const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const browser = readFileSync(new URL("../src/dashboard-record-browser.jsx", import.meta.url), "utf8");
  const shared = readFileSync(new URL("../src/shared-actions-table.jsx", import.meta.url), "utf8");
  assert.match(main, /FilterDialog=\{TableParameterFilter\} ExportMenu=\{ExportMenu\}/);
  assert.match(main, /title=\{assetDrilldownTitle\} initialRegion=/);
  assert.match(browser, /exportTitle=\{`\$\{title\} · \$\{view\.selection\.region \|\| "Fleet"\}`\}/);
  assert.match(shared, /ExportMenu && exportTitle \? tableExportModel\(dataRows, columns, visible, localFilters, sort\) : null/);
  assert.match(shared, /<ExportMenu title=\{exportTitle\} columns=\{exportData\.columns\} rows=\{exportData\.rows\}/);
});
