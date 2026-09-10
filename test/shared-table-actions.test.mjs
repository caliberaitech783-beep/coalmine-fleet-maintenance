import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import React from "react";
import {tableElements, tableCellText, tableModel, projectTableRow, tableSlots, selectTableRows, dateColumnsFirst, jobReferenceColumnsLast, requestColumnsInWorkflowOrder} from "../src/table-actions-model.mjs";

const h = React.createElement;
const row = (key, ...cells) => h("tr", {key}, cells.map((value, i) => h("td", {key: i}, value)));
const headers = h("thead", {}, h("tr", {}, h("th", {}, "Name"), h("th", {}, "Count")));

test("workflow request columns use the requested order with all remaining fields preserved", () => {
  const labels = ["Actions", "Job reference", "Equipment group", "Door no.", "Model", "Site location", "Repair category", "Reason", "Status", "Started", "Closed", "Days of breakdown"];
  const {columns} = tableModel(h("thead", {}, h("tr", {}, labels.map(label => h("th", {}, label)))));
  const ordered = requestColumnsInWorkflowOrder(columns);
  const maintenance = requestColumnsInWorkflowOrder(columns, true);
  assert.equal(maintenance[0].label, "Actions");
  assert.deepEqual(maintenance.slice(1), ordered.filter(c => c.label !== "Actions"));
  assert.deepEqual(tableSlots(projectTableRow(row("maintenance", ...labels), maintenance.map(c => c.index))).map(s => tableCellText(s.cell)), maintenance.map(c => c.label));
  assert.deepEqual(ordered.map(c => c.label), ["Started", "Closed", "Days of breakdown", "Status", "Door no.", "Site location", "Repair category", "Reason", "Actions", "Equipment group", "Model", "Job reference"]);
  assert.deepEqual(tableSlots(projectTableRow(row("record", ...labels), ordered.map(c => c.index))).map(s => tableCellText(s.cell)), ordered.map(c => c.label));
  assert.deepEqual(columns.map(c => c.label), labels);
});

test("job references come last outside Reports without changing other columns or values", () => {
  const labels = ["Actions", "Job reference", "Site", "Started", "Closed", "Ticket reference"];
  const {columns} = tableModel(h("thead", {}, h("tr", {}, labels.map(label => h("th", {}, label)))));
  const ordered = jobReferenceColumnsLast(dateColumnsFirst(columns));
  assert.deepEqual(ordered.map(c => c.label), ["Started", "Closed", "Actions", "Site", "Ticket reference", "Job reference"]);
  assert.deepEqual(tableSlots(projectTableRow(row("record", ...labels), ordered.map(c => c.index))).map(s => tableCellText(s.cell)), ordered.map(c => c.label));
  assert.deepEqual(columns.map(c => c.label), labels);
  const main = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(main, /jobReferenceColumnsLast/);
  const shared = fs.readFileSync(new URL("../src/shared-actions-table.jsx", import.meta.url), "utf8");
  assert.match(shared, /jobReferenceColumnsLast\(dateColumnsFirst\(originalColumns\)\)/);
});

test("status leads, then non-report dates, while remaining columns retain their order", () => {
  const labels = ["Actions", "Status", "Started", "Site", "Closed", "Closed by", "MIS verified at", "First trip time", "Turn around time (TAT)"];
  const {columns} = tableModel(h("thead", {}, h("tr", {}, labels.map(label => h("th", {}, label)))));
  const ordered = dateColumnsFirst(columns);
  assert.deepEqual(ordered.map(c => c.label), ["Status", "Started", "Closed", "MIS verified at", "First trip time", "Actions", "Site", "Closed by", "Turn around time (TAT)"]);
  assert.deepEqual(tableSlots(projectTableRow(row("record", ...labels), ordered.map(c => c.index))).map(s => tableCellText(s.cell)), ordered.map(c => c.label));
  assert.deepEqual(columns.map(c => c.label), labels);
  const main = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const report = main.slice(main.indexOf("function ReportTable("), main.indexOf("function ReportTable(") + 12000);
  assert.match(report, /<table className="report-filter-table">/);
  assert.doesNotMatch(report, /dateColumnsFirst/);
});

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
  assert.match(shared, /recordDateFilter===false \? null/);
});

test("data-sort-value drives sorting so dates and durations order by their raw value", () => {
  const {columns} = tableModel(headers);
  const dated = (key, label, raw) => h("tr", {key}, h("td", {key: 0}, label), h("td", {key: 1, "data-sort-value": raw}, "shown"));
  const rows = [dated("late", "C", "2026-09-10 12:48:06"), dated("early", "A", "2026-09-09 08:00:00"), dated("minutes", "B", 27)];
  assert.equal(columns[1].sortValue(rows[2]), 27);
  assert.equal(columns[1].value(rows[2]), "shown");
  assert.deepEqual(selectTableRows(rows.slice(0, 2), columns, {}, {key: columns[1].key, direction: "asc"}).map(r => r.key), ["early", "late"]);
  const minutes = [dated("nine", "x", 9), dated("twentyseven", "y", 27), dated("hundred", "z", 100)];
  assert.deepEqual(selectTableRows(minutes, columns, {}, {key: columns[1].key, direction: "desc"}).map(r => r.key), ["hundred", "twentyseven", "nine"]);
});

test("plain column headings in shared Actions tables sort on click", () => {
  const shared = fs.readFileSync(new URL("../src/shared-actions-table.jsx", import.meta.url), "utf8");
  assert.match(shared, /const sortableHeaderRow = \(row\) =>/);
  assert.match(shared, /cell\.type !== "th" \|\| !column \|\| span > 1 \|\| cell\.props\.onSort/);
  assert.match(shared, /className=\{`sort-header\$\{active \? " active" : ""\}`\}/);
  assert.match(shared, /applySort\(column\.key, active && sort\.direction === "asc" \? "desc" : "asc"\)/);
  assert.match(shared, /section\.type === "thead"\) sectionRows = sectionRows\.map/);
});

test("plain column headings in shared Actions tables open a sort-and-filter popover", () => {
  const shared = fs.readFileSync(new URL("../src/shared-actions-table.jsx", import.meta.url), "utf8");
  const main = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(main, /<SharedActionsTable \{\.\.\.props\}[^\n]*FilterableHeader=\{FilterableHeader\} \/>/);
  assert.match(shared, /FilterableHeader = null/);
  assert.match(shared, /const \[openFilter, setOpenFilter\] = useState\(null\);/);
  assert.match(shared, /event\.target\.closest\?\.\("\.column-filter-header, \.column-filter-popover"\)/);
  assert.match(shared, /<FilterableHeader key=\{cell\.key \?\? column\.key\} label=\{column\.label\} sortKey=\{column\.key\} sort=\{sort\} onSort=\{applySort\}/);
  assert.match(shared, /values=\{columnValues\[column\.key\] \|\| \[\]\} filterValue=\{filters\[column\.key\] \|\| ""\} onFilterChange=\{\(value\) => updateFilter\(column\.key, value\)\}/);
  assert.match(shared, /dataRows\.map\(\(row\) => column\.value\(row\)\)\.filter\(Boolean\)/, "filter values come from the full unfiltered table");
});

test("date range filters apply to shared Actions tables using the raw sort value or displayed date", () => {
  const {columns} = tableModel(headers);
  const dated = (key, shown, raw) => h("tr", {key}, h("td", {key: 0}, key), h("td", {key: 1, ...(raw ? {"data-sort-value": raw} : {})}, shown));
  const rows = [dated("a", "09-09-2026 10:15:29 AM", "2026-09-09 10:15:29"), dated("b", "10-09-2026 01:33:53 PM", "2026-09-10 13:33:53"), dated("c", "11-09-2026 02:01:06 PM"), dated("d", "—")];
  const range = "__date_range__:2026-09-10|2026-09-11";
  assert.deepEqual(selectTableRows(rows, columns, {[columns[1].key]: range}, {}).map(r => r.key), ["b", "c"]);
  assert.deepEqual(selectTableRows(rows, columns, {[columns[1].key]: "__date_range__:|2026-09-09"}, {}).map(r => r.key), ["a"]);
  assert.deepEqual(selectTableRows(rows, columns, {[columns[1].key]: "10-09-2026 01:33:53 PM"}, {}).map(r => r.key), ["b"], "exact value filters still work");
});

test("date column headings open only From / To date pickers", () => {
  const main = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(main, /dateColumn = looksLikeDateColumn\(values\)/);
  assert.match(main, / : dateColumn \? <div className="column-filter-range" role="group"/, "date columns open only the From / To pickers");
  assert.doesNotMatch(main, /rangeOpen|Filter by date range/);
  assert.match(main, /<label><span>From<\/span><input type="date" autoFocus value=\{dateRange\.from\}/);
  assert.match(main, /<label><span>To<\/span><input type="date" value=\{dateRange\.to\}/);
  assert.match(main, /const range = parseDateRange\(selected\);\s*if \(range\) return matchesDateRange\(value, range\);/);
  assert.match(main, /parseDateRange\(filters\[column\.key\]\) && <option value=\{filters\[column\.key\]\}>/);
});

test("rows without a value sort last in both directions", () => {
  const {columns} = tableModel(headers);
  const rows = [row("dash", "A", "—"), row("late", "B", "2026-09-10 16:00:32"), row("blank", "C", ""), row("early", "D", "2026-09-09 08:00:00")];
  assert.deepEqual(selectTableRows(rows, columns, {}, {key: columns[1].key, direction: "asc"}).map(r => r.key), ["early", "late", "dash", "blank"]);
  assert.deepEqual(selectTableRows(rows, columns, {}, {key: columns[1].key, direction: "desc"}).map(r => r.key), ["late", "early", "dash", "blank"]);
});

test("Total Fleet lists sort Started oldest-to-latest from the heading instead of picking dates", () => {
  const shared = fs.readFileSync(new URL("../src/shared-actions-table.jsx", import.meta.url), "utf8");
  const main = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const browser = fs.readFileSync(new URL("../src/dashboard-record-browser.jsx", import.meta.url), "utf8");
  assert.match(shared, /dateSortOnly=\{cell\.props\["data-filter-mode"\] === "date-sort"\}/);
  assert.match(browser, /<th data-filter-mode=\{requestRecords \? undefined : "date-sort"\}>Started<\/th>/);
  assert.match(main, /dateSortOnly = false,/);
  assert.match(main, /\{dateSortOnly \? <div className="column-filter-sort duration-sort-options"/);
  assert.match(main, /<span>Oldest to latest<\/span>/);
  assert.match(main, /<span>Latest to oldest<\/span>/);
});
