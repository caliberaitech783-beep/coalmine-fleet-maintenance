import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";
import { recordDateKey, filterRecordsByDate, primaryRecordDateColumn } from "../src/record-date-range.mjs";
import { describeDateRange, encodeDateRange, parseDateRange } from "../src/date-range-filter.mjs";
import { tableModel, tableExportModel } from "../src/table-actions-model.mjs";

test("non-report record dates prefer Started over closure/verification and ignore undated masters", () => {
  const columns = ["Status", "MIS verified at", "Closed", "Started", "Days of breakdown"].map((label, index) => ({key: `${index}:${label}`, label}));
  assert.equal(primaryRecordDateColumn(columns).label, "Started");
  assert.equal(primaryRecordDateColumn([{key:"start",label:"Production date and time"}]).key, "start");
  assert.equal(primaryRecordDateColumn([{key:"occurredAt",label:"Event time"}]).key, "occurredAt");
  assert.equal(primaryRecordDateColumn(["Employee DOB", "Expiry date", "Days of breakdown", "Created by"].map(label => ({key:label,label}))), null);
});

test("range includes both whole Indian days, handles UTC midnight boundaries and excludes missing dates only when filtering", () => {
  const rows = [
    {id:"before",at:"2026-09-08T18:29:59Z"},
    {id:"first",at:"2026-09-08T18:30:00Z"},
    {id:"last",at:"2026-09-10T18:29:59Z"},
    {id:"after",at:"2026-09-10T18:30:00Z"},
    {id:"local",at:"10-09-2026 05:30:00 PM"},
    {id:"missing",at:"—"},
  ];
  const range = encodeDateRange("2026-09-09", "2026-09-10");
  assert.equal(recordDateKey(rows[1].at), "2026-09-09");
  assert.equal(recordDateKey(rows[3].at), "2026-09-11");
  assert.deepEqual(filterRecordsByDate(rows, range, row => row.at).map(row => row.id), ["first","last","local"]);
  assert.equal(filterRecordsByDate(rows, "", row => row.at), rows);
  assert.deepEqual(filterRecordsByDate(rows, encodeDateRange("", "2026-09-08"), row => row.at).map(row => row.id), ["before"]);
  assert.deepEqual(filterRecordsByDate(rows, encodeDateRange("2026-09-11", ""), row => row.at).map(row => row.id), ["after"]);
});

test("table print/export use the same inclusive date range as displayed rows, with sorting and other filters", () => {
  const h=React.createElement;
  const {columns}=tableModel(h("thead",null,h("tr",null,h("th",null,"Started"),h("th",null,"Status"))));
  const rows = [
    ["1","2026-09-09 10:00:00","Open"], ["2","2026-09-10T18:30:00Z","Open"],
    ["3","2026-09-10 23:59:59","Open"], ["4","2026-09-10 14:00:00","Closed"], ["5","—","Open"],
  ].map(([key, date, status]) => h("tr",{key},h("td",{"data-sort-value":date},date),h("td",null,status)));
  const exportData=tableExportModel(rows, columns, columns.map(c=>c.key), {
    [columns[0].key]:encodeDateRange("2026-09-09","2026-09-10"), [columns[1].key]:"Open",
  },{key:columns[0].key,direction:"desc"});
  assert.deepEqual(exportData.rows.map(row=>row.key), ["3","1"]);
});

const source=readFileSync(new URL("../src/record-date-range.jsx",import.meta.url),"utf8").replace(/^import .*;\r?\n/gm,"").replace("export default function","function");
const {code}=await transformWithOxc(source,"record-date-range.jsx",{jsx:{runtime:"classic"}});
const descendants=(node,predicate)=>Array.isArray(node)?node.flatMap(child=>descendants(child,predicate)) : React.isValidElement(node)?[...(predicate(node)?[node]:[]),...descendants(node.props.children,predicate)]:[];

test("visible From and To fields apply valid ranges, preserve the prior filter for reversed dates, and reset", () => {
  let state, currentValue="";
  const bindings={React,describeDateRange,encodeDateRange,parseDateRange,useId:()=>"date-test",useEffect(){},useState(initial){if(state===undefined)state=initial();return[state,next=>{state=next;}];}};
  const Component=new Function(...Object.keys(bindings),`${code};return RecordDateRange;`)(...Object.values(bindings));
  const render=()=>Component({label:"Started",value:currentValue,onChange:value=>{currentValue=value;}});
  const change=(label,value)=>descendants(render(),node=>node.type==="input"&&node.props["aria-label"]===label)[0].props.onChange({target:{value}});
  assert.match(renderToStaticMarkup(render()), /Started from date/);
  change("Started from date","2026-09-09");
  change("Started to date","2026-09-10");
  assert.equal(currentValue,encodeDateRange("2026-09-09","2026-09-10"));
  assert.match(renderToStaticMarkup(render()),/Date range 09-09-2026 to 10-09-2026/);
  change("Started from date","2026-09-11");
  assert.match(renderToStaticMarkup(render()),/previous filter is still applied/);
  assert.equal(currentValue,encodeDateRange("2026-09-09","2026-09-10"));
  descendants(render(),node=>node.type==="button")[0].props.onClick();
  assert.equal(currentValue,"");
  assert.match(renderToStaticMarkup(render()),/All dates/);
});

test("Reports stay on their existing table implementation; dated workflow tables share their existing filter/export state", () => {
  const main=readFileSync(new URL("../src/main.jsx",import.meta.url),"utf8");
  const report=main.slice(main.indexOf("function ReportTable("),main.indexOf("function ReportTable(")+11000);
  assert.match(report,/<table className="report-filter-table">/);
  assert.doesNotMatch(report,/RecordDateRange|recordDateFilter|primaryRecordDateColumn/);
  const shared=readFileSync(new URL("../src/shared-actions-table.jsx",import.meta.url),"utf8");
  assert.match(shared,/value: effectiveFilters\[dateColumn.key\], onChange: \(value\) => updateFilter\(dateColumn.key, value\)/);
  assert.match(shared,/\{printData && dateRangeControl\}\s*\{printData && <ExportMenu printOnly/);
  assert.match(main,/filterRecordsByDate\(sameScope \? ticketState.records : \[\], ticketDateRange, \(ticket\) => ticket.createdAt\)/);
});
