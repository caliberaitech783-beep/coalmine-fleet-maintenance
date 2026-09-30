import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";
import { recordDateKey, filterRecordsByDate, primaryRecordDateColumn } from "../src/record-date-range.mjs";
import { describeDateRange, encodeDateRange, parseDateRange } from "../src/date-range-filter.mjs";
import { tableModel, tableExportModel } from "../src/table-actions-model.mjs";
import DateInput from '../src/date-input.mjs';
import { indiaToday } from '../src/report-period-model.mjs';

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

test("today is applied once in IST; clearing, rerendering and explicit ranges remain user controlled", () => {
  assert.equal(indiaToday(new Date('2026-09-29T18:30:00Z')), '2026-09-30');
  assert.equal(indiaToday(new Date('2026-09-29T18:29:59Z')), '2026-09-29');
  for (const initialValue of ['', encodeDateRange('2026-09-01', '2026-09-05')]) {
    let state, value=initialValue;
    const initialized={current:false}, effects=[], changes=[];
    const bindings={React,describeDateRange,encodeDateRange,parseDateRange,indiaToday:()=> '2026-09-30',
      useId:()=> 'default-test',useRef:()=>initialized,useEffect:callback=>effects.push(callback),
      useState(initial){if(state===undefined)state=initial();return[state,next=>{state=next;}];}};
    const Component=new Function('DateInput',...Object.keys(bindings),`${code};return RecordDateRange;`)(DateInput,...Object.values(bindings));
    const render=()=>{const tree=Component({label:'Started',value,defaultToday:true,onChange:next=>{value=next;changes.push(next);}});effects.splice(0).forEach(effect=>effect());return tree;};
    render(); render();
    assert.equal(value,initialValue||encodeDateRange('2026-09-30','2026-09-30'));
    assert.equal(changes.length,initialValue?0:1);
    const rows=[{at:'2026-09-29T18:30:00Z'},{at:'2026-09-29T18:29:59Z'}];
    if(!initialValue)assert.deepEqual(filterRecordsByDate(rows,value,row=>row.at),[rows[0]]);
    descendants(render(),node=>node.type==='button')[0].props.onClick();
    render(); render();
    assert.equal(value,'');
    assert.deepEqual(state,{from:'',to:''});
    assert.equal(filterRecordsByDate(rows,value,row=>row.at),rows);
    value=encodeDateRange('2026-08-01','2026-08-31'); render(); render();
    assert.deepEqual(state,{from:'2026-08-01',to:'2026-08-31'});
  }
});

test("visible From and To fields apply valid ranges, preserve the prior filter for reversed dates, and reset", () => {
  let state, currentValue="";
  const bindings={React,describeDateRange,encodeDateRange,parseDateRange,useId:()=>"date-test",useRef:()=>({current:false}),useEffect(){},useState(initial){if(state===undefined)state=initial();return[state,next=>{state=next;}];}};
  const Component=new Function('DateInput',...Object.keys(bindings),`${code};return RecordDateRange;`)(DateInput,...Object.values(bindings));
  const render=()=>Component({label:"Started",value:currentValue,onChange:value=>{currentValue=value;}});
  const change=(label,value)=>descendants(render(),node=>(node.type==="input"||node.type===DateInput)&&node.props["aria-label"]===label)[0].props.onChange({target:{value}});
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
  assert.doesNotMatch(renderToStaticMarkup(render()),/All dates|record-date-range-basis/);
});

test("Reports stay on their existing table implementation; dated workflow tables share their existing filter/export state", () => {
  const main=readFileSync(new URL("../src/main.jsx",import.meta.url),"utf8");
  const report=main.slice(main.indexOf("function ReportTable("),main.indexOf("function ReportTable(")+11000);
  assert.match(report,/<table className="report-filter-table">/);
  assert.doesNotMatch(report,/RecordDateRange|recordDateFilter|primaryRecordDateColumn/);
  const shared=readFileSync(new URL("../src/shared-actions-table.jsx",import.meta.url),"utf8");
  assert.match(shared,/value: effectiveFilters\[dateColumn.key\], onChange: \(value\) => updateFilter\(dateColumn.key, value\)/);
  assert.match(shared,/\{dateRangeControl\}/);
  assert.doesNotMatch(shared,/<ExportMenu printOnly/);
  assert.match(shared,/smartPrintRows=\{smartPrintData.rows\} smartPrintItem/);
  assert.match(main,/filterRecordsByDate\(sameScope \? ticketState.records : \[\], ticketDateRange, \(ticket\) => ticket.createdAt\)/);
});

test('non-dashboard filters remain blank and unfiltered on mount',()=>{
  const effects=[],changes=[];
  const bindings={React,describeDateRange,encodeDateRange,parseDateRange,indiaToday,
    useId:()=> 'all-days',useRef:()=>({current:false}),useEffect:callback=>effects.push(callback),useState:initial=>[initial(),()=>{}]};
  const Component=new Function('DateInput',...Object.keys(bindings),`${code};return RecordDateRange;`)(DateInput,...Object.values(bindings));
  const tree=Component({label:'Started',value:'',onChange:value=>changes.push(value)});
  effects.forEach(effect=>effect());
  assert.deepEqual(changes,[]);
  assert.deepEqual(descendants(tree,node=>node.type===DateInput).map(node=>node.props.value),['','']);
  const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.doesNotMatch(main,/dateRangeOpened/);
  const browser=readFileSync(new URL('../src/dashboard-record-browser.jsx',import.meta.url),'utf8');
  assert.doesNotMatch(browser,/defaultDateToday/);
  assert.match(browser,/<ActionsTable key=\{tableKey\}/);
  assert.doesNotMatch(main,/<DashboardRecordBrowser key=\{assetDrilldown\}[^>]*defaultDateToday/);
  assert.doesNotMatch(main,/<DashboardRecordBrowser key=\{managerDrilldown\}[^>]*defaultDateToday/);
  const shared=readFileSync(new URL('../src/shared-actions-table.jsx',import.meta.url),'utf8');
  assert.match(shared,/defaultDateToday = false/);
  assert.match(shared,/defaultToday=\{defaultDateToday\}/);
});
