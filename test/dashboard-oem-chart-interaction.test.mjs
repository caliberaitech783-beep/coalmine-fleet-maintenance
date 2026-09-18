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
  const equipment = Array.from({length: 12}, (_, id) => ({id, make: `OEM ${id % 10}`, door: `V${id}`, currentLocation: id < 6 ? "Sasti OB" : "Majri OB", category: "Vehicle"}));
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

test("every coloured segment and OEM legend button opens exactly its displayed site's and OEM's records", () => {
  const chart = makeChart();
  let selected, stopped;
  const tree = Chart({chart, onSelect: selection => {selected = createOemBreakdownSelection(chart, selection);}});
  const controls = descendants(tree, node => node.type === "button");
  const click = control => {stopped = false; control.props.onClick({stopPropagation() {stopped = true;}}); assert.ok(stopped, "nested click must not open the whole chart");};
  for (const site of chart.sites) for (const segment of site.segments) {
    const control = controls.find(control => control.props["aria-label"] === `${site.name} · ${segment.label}: ${segment.rows.length} breakdown assets, view details`);
    assertTooltip(control, segment, segment.rows.length, site.name);
    click(control);
    assert.equal(selected.records.length, segment.rows.length);
    assert.deepEqual(selected.records.map(record => record.requestReference), segment.rows.flatMap(row => row.requests.map(request => request.ref)));
    assert.ok(selected.records.every(record => record.make === segment.label && record.requestSite === site.name));
  }
  for (const oem of chart.oems) {
    const count = chart.rows.filter(row => row.oemKey === oem.key).length;
    const control = controls.find(control => control.props["aria-label"] === `${oem.label}: ${count} breakdown assets, view details`);
    assertTooltip(control, oem, count, "Sites matching current filters");
    click(control);
    assert.equal(selected.rows.length, count);
    assert.ok(selected.records.every(record => record.make === oem.label));
  }
});

test("All and View full list preserve the current OEM and site filters with an empty selection", () => {
  for (const oem of ["all", "oem 0"]) {
    const chart = makeChart({oem, sites: ["Sasti OB"]});
    let payload, selected;
    const tree = Chart({chart, onSelect: selection => {payload = selection; selected = createOemBreakdownSelection(chart, selection);}, onReset: () => assert.fail("list controls must not reset filters")});
    const legend = descendants(tree, node => node.props.className === "mine-oem-legend")[0];
    const legendControls = descendants(legend, node => node.type === "button");
    assert.equal(legendControls.at(-1).props.className, "mine-oem-all", "All follows the OEM legend entries");
    const fullList = descendants(tree, node => node.type === "button" && (node.props.className === "mine-oem-all" || textOf(node).startsWith("View full list")));
    assert.equal(fullList.length, 2);
    for (const control of fullList) {
      let stopped = false;
      control.props.onClick({stopPropagation() {stopped = true;}});
      assert.ok(stopped);
      assert.deepEqual(payload, {});
      assert.deepEqual(selected.rows, chart.rows);
      assert.ok(selected.records.every(record => record.requestSite === "Sasti OB"));
      assert.equal(control.props["data-oem-count"], chart.rows.length);
      assert.equal(control.props["data-oem-site"], "Sasti OB");
      if (oem !== "all") {
        assert.equal(selected.oem, oem);
        assertTooltip(control, chart.oems.find(item => item.key === oem), chart.rows.length, "Sasti OB");
      } else {
        assert.equal(control.props["data-oem-name"], "All OEMs");
        for (const segment of chart.sites[0].segments) assert.ok(control.props["data-oem-color"].includes(segment.color));
      }
    }
  }
});

test("site totals retain the selected OEM and describe the actual list scope including zero counts", () => {
  for (const oem of ["all", "oem 0"]) {
    const chart = makeChart({oem});
    let payload, selected;
    const tree = Chart({chart, onSelect: selection => {payload = selection; selected = createOemBreakdownSelection(chart, selection);}});
    const sites = descendants(tree, node => node.type === "section");
    sites.forEach((siteTree, index) => {
      const site = chart.sites[index];
      const controls = descendants(siteTree, node => ["mine-oem-total", "mine-oem-site-label"].includes(node.props.className));
      assert.equal(controls.length, 2);
      const total = controls.find(control => control.props.className === "mine-oem-total");
      assert.equal(total.props["aria-label"], `${site.name}: ${site.total} breakdown assets, ${oem === "all" ? "view all OEMs" : "view details"}`);
      for (const control of controls) {
        let stopped = false;
        control.props.onClick({stopPropagation() {stopped = true;}});
        assert.ok(stopped);
        assert.deepEqual(payload, {site: site.name});
        assert.equal(selected.rows.length, site.total);
        assert.ok(selected.records.every(record => record.requestSite === site.name));
        assert.equal(control.props["data-oem-count"], site.total);
        assert.equal(control.props["data-oem-site"], site.name);
        if (oem !== "all") {
          assert.equal(selected.oem, oem);
          assertTooltip(control, chart.oems.find(item => item.key === oem), site.total, site.name);
          assert.doesNotMatch(control.props.title, /all OEM/);
        } else {
          assert.equal(control.props["data-oem-name"], "All OEMs");
          assert.ok(control.props["data-oem-color"]);
          for (const segment of site.segments) assert.ok(control.props["data-oem-color"].includes(segment.color));
        }
      }
    });
    const targets = descendants(tree, node => node.props["data-oem-tooltip"]);
    assert.equal(new Set(targets.map(node => node.props["data-oem-tooltip"])).size, targets.length, "each tooltip target needs a distinct description id");
    for (const target of targets) assert.equal(target.props["aria-describedby"], target.props["data-oem-tooltip"]);
  }
});

test("the tooltip wrapper renders an inert chart surface and tiny segments keep their real proportions", () => {
  const equipment = Array.from({length: 100}, (_, id) => ({id, make: id ? "Large OEM" : "Tiny OEM", door: `V${id}`, currentLocation: "Sasti OB", status: "Breakdown"}));
  const chart = buildOemBreakdownChart({rows: buildOemBreakdownRows({equipment}), equipment, regions: [{code: "WCL", sites: ["Sasti OB"]}]});
  const tree = Chart({chart, onSelect: () => assert.fail("rendering and blank areas must not select records")});
  const tiny = descendants(tree, node => node.props.className === "mine-oem-segment" && node.props["data-oem-name"] === "Tiny OEM")[0];
  assert.equal(tiny.props.style.height, "1%");
  assert.equal(textOf(tiny), "1", "one-asset segments always show their exact count");
  assert.equal(tiny.props["data-count-callout"], true, "a count too small for the bar gets a connected badge");
  assertTooltip(tiny, chart.oems.find(oem => oem.label === "Tiny OEM"), 1, "Sasti OB");
  for (const node of descendants(tree, node => node.type !== "button")) assert.equal(node.props.onClick, undefined);
  const markup = renderToStaticMarkup(tree);
  assert.match(markup, /^<div class="mine-oem-dashboard" id="oem-breakdown-plot"/);
  assert.doesNotMatch(markup, /role="button"/);
  assert.match(markup, /aria-describedby="oem-breakdown-tooltip-all"/);
});

test("every coloured slice shows its count, and normal one-asset slices fit inside the bar", () => {
  const equipment = Array.from({length: 28}, (_, id) => ({id, make: id < 4 ? `Single ${id}` : "Large OEM", door: `V${id}`, currentLocation: "Sasti OB", status: "Breakdown"}));
  const chart = buildOemBreakdownChart({rows: buildOemBreakdownRows({equipment}), equipment, regions: [{code: "WCL", sites: ["Sasti OB"]}]});
  const tree = Chart({chart, onSelect: () => {}});
  assert.equal(tree.props.plotHeight, 420);
  for (const segment of descendants(tree, node => node.props.className === "mine-oem-segment")) {
    const label = descendants(segment, node => node.type === "b")[0];
    assert.equal(textOf(label), String(segment.props["data-oem-count"]));
    assert.equal(segment.props["data-count-callout"], undefined);
    assert.ok(segment.props["data-oem-count"] / chart.axisMax * tree.props.plotHeight >= 14);
  }
});

test("crowded tiny counts remain separate and connected without distorting the stacked chart", () => {
  const equipment = Array.from({length: 500}, (_, id) => ({id, make: id < 7 ? `A Single ${id}` : id >= 493 ? `Z Single ${id}` : "Middle OEM", door: `V${id}`, currentLocation: "Sasti OB", status: "Breakdown"}));
  const chart = buildOemBreakdownChart({rows: buildOemBreakdownRows({equipment}), equipment, regions: [{code: "WCL", sites: ["Sasti OB"]}]});
  let selected;
  const tree = Chart({chart, onSelect: value => { selected = value; }});
  assert.equal(tree.props.plotHeight, 560);
  const segments = descendants(tree, node => node.props.className === "mine-oem-segment");
  let bottom = 0;
  const labelCenters = [];
  for (const segment of segments) {
    const count = segment.props["data-oem-count"];
    assert.equal(segment.props.style.height, `${count / 500 * 100}%`);
    if (segment.props["data-count-callout"]) {
      const label = descendants(segment, node => node.props.className === "mine-oem-segment-label")[0];
      assert.equal(textOf(label), "1");
      assert.equal(label.props.style.background, segment.props.style.background);
      assert.equal(descendants(segment, node => node.type === "line").length, 1);
      labelCenters.push(bottom + parseFloat(label.props.style.bottom) + 7);
      segment.props.onClick({stopPropagation() {}});
      assert.equal(createOemBreakdownSelection(chart, selected).rows.length, 1);
    }
    bottom += count / chart.axisMax * tree.props.plotHeight;
  }
  assert.equal(labelCenters.length, 14);
  labelCenters.forEach((center, index) => {
    assert.ok(center >= 7 && center <= tree.props.plotHeight - 7);
    if (index) assert.ok(center - labelCenters[index - 1] >= 18 - 1e-6);
  });
});

test("the plot uses the room the screen has left so the whole panel stays on one page", () => {
  const chart = makeChart();
  const unmeasured = Chart({chart}).props.plotHeight;
  assert.ok(unmeasured >= 260, "without a measurement the chart keeps its full height");
  assert.equal(Chart({chart, availableHeight: 0}).props.plotHeight, unmeasured);
  const short = unmeasured - 60;
  assert.equal(Chart({chart, availableHeight: short}).props.plotHeight, short, "a short screen shrinks the bars instead of scrolling the page");
  assert.equal(Chart({chart, availableHeight: 5000}).props.plotHeight, unmeasured, "spare room never stretches the bars past their own size");
  assert.equal(Chart({chart, availableHeight: 40}).props.plotHeight, 200, "the plot never collapses below a readable height");
  const fitted = Chart({chart, availableHeight: short});
  assert.ok(descendants(fitted, node => node.props?.className === "mine-oem-stack").length, "bars still render at the fitted height");
  const labels = descendants(fitted, node => node.props?.className === "mine-oem-segment-label");
  assert.ok(labels.length, "segment counts are still placed against the fitted height");
});
