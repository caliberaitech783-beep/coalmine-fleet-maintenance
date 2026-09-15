import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import React from "react";
import {transformWithOxc} from "vite";
import {buildOemBreakdownRows, buildOemBreakdownChart, createOemBreakdownSelection} from "../src/oem-breakdown-model.mjs";

const source = readFileSync(new URL("../src/oem-breakdown-chart.jsx", import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "").replace("export default function", "function");
const {code} = await transformWithOxc(source, "OemChart.jsx", {jsx: {runtime: "classic"}});
const Chart = new Function("React", `${code}; return OemBreakdownChart;`)(React);
const descendants = (node, predicate) => Array.isArray(node) ? node.flatMap(child => descendants(child, predicate)) : React.isValidElement(node) ? [...(predicate(node) ? [node] : []), ...descendants(node.props.children, predicate)] : [];

test("every coloured segment and OEM legend button opens exactly its displayed site's and OEM's records", () => {
  const equipment = Array.from({length: 12}, (_, id) => ({id, make: `OEM ${id % 10}`, door: `V${id}`, currentLocation: id < 6 ? "Sasti OB" : "Majri OB", category: "Vehicle"}));
  const requests = equipment.map(asset => ({ref: `BD${asset.id}`, door: asset.door, site: asset.currentLocation, status: "Open", start: "2026-09-10 08:00"}));
  const chart = buildOemBreakdownChart({rows: buildOemBreakdownRows({equipment, requests}), equipment, regions: [{code: "WCL", sites: ["Sasti OB", "Majri OB"]}]});
  let selected, stopped;
  const tree = Chart({chart, onSelect: selection => {selected = createOemBreakdownSelection(chart, selection);}});
  const controls = descendants(tree, node => node.type === "button");
  const click = control => {stopped = false; control.props.onClick({stopPropagation() {stopped = true;}}); assert.ok(stopped, "nested click must not open the whole chart");};
  for (const site of chart.sites) for (const segment of site.segments) {
    click(controls.find(control => control.props["aria-label"] === `${site.name} · ${segment.label}: ${segment.rows.length} breakdown assets, view details`));
    assert.equal(selected.records.length, segment.rows.length);
    assert.deepEqual(selected.records.map(record => record.requestReference), segment.rows.flatMap(row => row.requests.map(request => request.ref)));
    assert.ok(selected.records.every(record => record.make === segment.label && record.requestSite === site.name));
  }
  for (const oem of chart.oems) {
    const count = chart.rows.filter(row => row.oemKey === oem.key).length;
    click(controls.find(control => control.props["aria-label"] === `${oem.label}: ${count} breakdown assets, view details`));
    assert.equal(selected.rows.length, count);
    assert.ok(selected.records.every(record => record.make === oem.label));
  }
});
