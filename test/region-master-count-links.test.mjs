import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import React from "react";
import {transformWithOxc} from "vite";
import {liveEquipmentMetrics, liveEquipmentRoadStatus} from "../dashboard-equipment-metrics.mjs";
import {recordBelongsToSite} from "../site-location.mjs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const component = source.slice(source.indexOf("function RegionMasterPage("), source.indexOf("Generic = function GenericWithMasters"));
const {code} = await transformWithOxc(component, "RegionMaster.jsx", {jsx: {runtime: "classic"}});
const descendants = (node, test) => Array.isArray(node) ? node.flatMap((child) => descendants(child, test))
  : React.isValidElement(node) ? [...(test(node) ? [node] : []), ...descendants(node.props.children, test)] : [];

test("region totals open the entire region, site totals retain only the chosen site, and aliases never double-count", () => {
  const equipment = [
    {id: 1, door: "S1", currentLocation: "Sasti OB", status: "Operational"},
    {id: 2, door: "M1", currentLocation: "Majri OB", status: "Operational"},
    {id: 3, door: "M2", currentLocation: "Majri OB", status: "Operational"},
    {id: 4, door: "J1", currentLocation: "Jayant OB", status: "Operational"},
  ];
  const requests = [{ref: "MAJRI-BD", door: "M1", site: "Majri OB", status: "Open", start: "2026-09-01"},
    {ref: "MAJRI-IDLE", door: "M2", site: "Majri OB", status: "Idle", start: "2026-09-01"}];
  const sites = ["Sasti OB", "SASTI II", "Majri OB"];
  const slots = [];
  let cursor = 0, opened;
  const bindings = {React, liveEquipmentMetrics, recordBelongsToSite, vehicles: [],
    regionSites: (record) => record.sites, matchesSmartSearch: () => true, useEffect() {},
    useState(initial) {const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial; return [slots[index], (next) => {slots[index] = next;}];},
    useMasterRecords: () => [equipment],
    ...Object.fromEntries([...component.matchAll(/<([A-Z]\w*)\b/g)].map((match) => [match[1], () => null])),
    Gauge: () => null, CheckCircle2: () => null, AlertTriangle: () => null, Clock: () => null};
  const Component = new Function(...Object.keys(bindings), `${code}; return RegionMasterPage;`)(...Object.values(bindings));
  const render = () => {cursor = 0; return Component({records: [{code: "WCL", sites}, {code: "NCL", sites: ["Jayant OB"]}], requests,
    gotoEquipment: (...args) => {opened = args;}});};
  let tree = render();
  for (const button of descendants(descendants(tree, (node) => node.props.className === "region-summary-strip")[0], (node) => node.type === "button")) {
    const count = descendants(button, (node) => node.type === "strong")[0].props.children;
    button.props.onClick();
    const [road, location, category, selectedSites] = opened;
    assert.equal(location, ""); assert.equal(category, "all"); assert.deepEqual(selectedSites, sites);
    const detail = equipment.filter((record) => selectedSites.some((site) => recordBelongsToSite(record, site))
      && (road === "all" || liveEquipmentRoadStatus(record, requests) === road));
    assert.equal(detail.length, count);
  }
  const siteTabs = descendants(descendants(tree, (node) => node.props.className === "region-site-tabs")[0], (node) => node.type === "button");
  siteTabs[2].props.onClick(); tree = render();
  for (const button of descendants(descendants(tree, (node) => node.props.className === "region-site-metrics")[0], (node) => node.type === "button")) {
    button.props.onClick();
    assert.equal(opened[1], "Majri OB");
    const count = Number(descendants(button, (node) => node.type === "strong")[0].props.children);
    assert.equal(equipment.filter((record) => recordBelongsToSite(record, opened[1]) && (opened[0] === "all" || liveEquipmentRoadStatus(record, requests) === opened[0])).length, count);
  }
  assert.match(source, /setEquipmentLocations\(locations\)/);
  assert.match(source, /allowedLocations=\{equipmentLocations\}/);
  assert.match(source, /!allowedLocations\.length \|\| allowedLocations\.some\(\(site\) => recordBelongsToSite\(v, site\)\)/);
});
