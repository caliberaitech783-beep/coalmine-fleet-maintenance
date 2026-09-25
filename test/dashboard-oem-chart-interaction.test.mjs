import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import React from "react";
import {createPortal} from "react-dom";
import {renderToStaticMarkup} from "react-dom/server";
import {transformWithOxc} from "vite";
import {buildOemBreakdownRows, buildOemBreakdownChart, createOemBreakdownSelection} from "../src/oem-breakdown-model.mjs";

const source = readFileSync(new URL("../src/oem-breakdown-chart.jsx", import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "").replace("export default function", "function");
const {code} = await transformWithOxc(source, "OemChart.jsx", {jsx: {runtime: "classic"}});
const Chart = new Function("React", "createPortal", `${code}; return OemBreakdownChart;`)(React, createPortal);
const descendants = (node, predicate) => Array.isArray(node) ? node.flatMap(child => descendants(child, predicate)) : React.isValidElement(node) ? [...(predicate(node) ? [node] : []), ...descendants(node.props.children, predicate)] : [];
const textOf = node => Array.isArray(node) ? node.map(textOf).join("") : React.isValidElement(node) ? textOf(node.props.children) : typeof node === "string" || typeof node === "number" ? String(node) : "";

function makeChart({oem = "all", sites = ["Sasti OB", "Majri OB", "Empty site"]} = {}) {
  const equipment = Array.from({length: 12}, (_, id) => ({id, make: `OEM ${id % 4}`, group: `Group ${id % 3}`, door: `V${id}`, currentLocation: id < 6 ? "Sasti OB" : "Majri OB", category: "Vehicle"}));
  const requests = equipment.map(asset => ({ref: `BD${asset.id}`, door: asset.door, site: asset.currentLocation, status: "Open", start: "2026-09-10 08:00"}));
  const rows = buildOemBreakdownRows({equipment, requests}).filter(row => sites.includes(row.site));
  return buildOemBreakdownChart({rows, equipment, regions: [{code: "WCL", sites}], oem});
}

function assertTooltip(control, {label, color}, count, site) {
  assert.ok(control.props["data-oem-tooltip"]);
  assert.equal(control.props["aria-describedby"], control.props["data-oem-tooltip"]);
  assert.equal(control.props["data-oem-name"], label);
  assert.equal(control.props["data-oem-color"], color);
  assert.equal(control.props["data-oem-count"], count);
  assert.equal(control.props["data-oem-site"], site);
}

const click = control => {
  let stopped = false;
  control.props.onClick({stopPropagation() { stopped = true; }});
  assert.ok(stopped, "nested click must not open the whole chart");
};

test("equipment-group bars drill into their exact rows while OEM dots only filter", () => {
  const chart = makeChart();
  let selected;
  let filtered;
  const tree = Chart({chart, onSelect: selection => { selected = createOemBreakdownSelection(chart, selection); }, onFilterOem: oem => { filtered = oem; }});
  const controls = descendants(tree, node => node.type === "button");
  for (const site of chart.sites) for (const bar of site.bars) {
    const control = controls.find(button => button.props["aria-label"] === `${site.name} · ${bar.oemLabel} · ${bar.equipmentGroup}: ${bar.rows.length} breakdown assets, view details`);
    assertTooltip(control, bar, bar.rows.length, site.name);
    click(control);
    assert.equal(selected.rows.length, bar.rows.length);
    assert.equal(selected.equipmentGroupLabel, bar.equipmentGroup);
    assert.ok(selected.rows.every(row => row.oemKey === bar.oemKey && row.equipmentGroupKey === bar.equipmentGroupKey && row.site === site.name));
  }
  for (const oem of chart.oems.filter(item => item.count)) {
    selected = undefined;
    const control = controls.find(button => button.props["aria-label"] === `Filter chart by ${oem.label}: ${oem.count} breakdown assets`);
    assertTooltip(control, oem, oem.count, "Sites matching current filters");
    click(control);
    assert.equal(filtered, oem.key);
    assert.equal(selected, undefined, "an OEM dot filters without opening the list");
  }
  const filteredChart = makeChart({oem: chart.oems[0].key});
  const filteredTree = Chart({chart: filteredChart, onSelect() {}, onFilterOem: value => { filtered = value; }});
  const active = descendants(filteredTree, node => node.props["aria-pressed"] === true)[0];
  click(active);
  assert.equal(filtered, "all", "selecting the active OEM dot clears the OEM filter");
});

test("All total breakdown and View full list preserve the current OEM and site filters", () => {
  for (const oem of ["all", "oem 0"]) {
    const chart = makeChart({oem, sites: ["Sasti OB"]});
    let payload, selected;
    const tree = Chart({chart, onSelect: selection => { payload = selection; selected = createOemBreakdownSelection(chart, selection); }});
    const fullList = descendants(tree, node => node.type === "button" && (node.props.className === "mine-oem-all" || textOf(node).startsWith("View full list")));
    assert.equal(fullList.length, 2);
    for (const control of fullList) {
      click(control);
      assert.deepEqual(payload, {});
      assert.deepEqual(selected.rows, chart.rows);
      assert.ok(selected.records.every(record => record.requestSite === "Sasti OB"));
      assert.equal(control.props["data-oem-count"], chart.rows.length);
    }
  }
});

test("site totals retain the selected OEM and every tooltip target stays unique", () => {
  for (const oem of ["all", "oem 0"]) {
    const chart = makeChart({oem});
    let selected;
    const tree = Chart({chart, onSelect: selection => { selected = createOemBreakdownSelection(chart, selection); }});
    const sites = descendants(tree, node => node.type === "section");
    sites.forEach((siteTree, index) => {
      const site = chart.sites[index];
      const controls = descendants(siteTree, node => ["mine-oem-total", "mine-oem-site-label"].includes(node.props.className));
      assert.equal(controls.length, 2);
      for (const control of controls) {
        click(control);
        assert.equal(selected.rows.length, site.total);
        assert.ok(selected.records.every(record => record.requestSite === site.name));
      }
    });
    const targets = descendants(tree, node => node.props["data-oem-tooltip"]);
    assert.equal(new Set(targets.map(node => node.props["data-oem-tooltip"])).size, targets.length);
  }
});

test("every OEM and equipment group has a separate proportional bar with its exact count", () => {
  const equipment = [
    {id: 1, make: "Tata", group: "Excavator", door: "A", currentLocation: "Sasti OB", status: "Breakdown"},
    {id: 2, make: "Tata", group: "Tipper", door: "B", currentLocation: "Sasti OB", status: "Breakdown"},
    {id: 3, make: "Tata", group: " tipper ", door: "C", currentLocation: "Sasti OB", status: "Breakdown"},
    {id: 4, make: "Komatsu", group: "Dozer", door: "D", currentLocation: "Sasti OB", status: "Breakdown"},
  ];
  const chart = buildOemBreakdownChart({rows: buildOemBreakdownRows({equipment}), equipment, regions: [{code: "WCL", sites: ["Sasti OB"]}]});
  assert.deepEqual(chart.sites[0].bars.map(bar => [bar.oemLabel, bar.equipmentGroup, bar.rows.length]), [["Komatsu", "Dozer", 1], ["Tata", "Excavator", 1], ["Tata", "Tipper", 2]]);
  const tree = Chart({chart, onSelect() {}});
  for (const bar of descendants(tree, node => node.props.className === "mine-oem-group-bar")) {
    assert.equal(bar.props.style.height, `${bar.props["data-oem-count"] / chart.axisMax * 100}%`);
    assert.equal(textOf(bar), String(bar.props["data-oem-count"]));
  }
  const markup = renderToStaticMarkup(tree);
  assert.match(markup, /^<div class="mine-oem-dashboard" id="oem-breakdown-plot"/);
  assert.doesNotMatch(markup, /role="button"/);
});

test("the plot uses the room the screen has left and retains grouped bars", () => {
  const chart = makeChart();
  const unmeasured = Chart({chart}).props.plotHeight;
  assert.ok(unmeasured >= 260);
  assert.equal(Chart({chart, availableHeight: 0}).props.plotHeight, unmeasured);
  const short = unmeasured - 60;
  assert.equal(Chart({chart, availableHeight: short}).props.plotHeight, short);
  assert.equal(Chart({chart, availableHeight: 5000}).props.plotHeight, unmeasured);
  assert.equal(Chart({chart, availableHeight: 40}).props.plotHeight, 200);
  const fitted = Chart({chart, availableHeight: short});
  assert.ok(descendants(fitted, node => node.props?.className === "mine-oem-group-bar").length);
  assert.ok(descendants(fitted, node => node.props?.className === "mine-oem-group-label").length);
});
