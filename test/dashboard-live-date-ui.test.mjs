import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import React from "react";
import {transformWithOxc} from "vite";
import * as metrics from "../dashboard-equipment-metrics.mjs";
import * as movement from "../dashboard-breakdown-movement.mjs";
import * as actions from "../src/dashboard-card-actions.mjs";
import * as dates from "../src/dashboard-request-data.mjs";
import * as forecast from "../src/dashboard-breakdown-forecast.mjs";
import * as model from "../src/dashboard-drilldown-model.mjs";
import {equipmentGroupValue, normalizeEquipmentGroup} from "../equipment-group.mjs";
import {dashboardCountScale} from "../src/dashboard-count-scale.mjs";
import {activeOpenCases} from "../dashboard-open-cases.mjs";
import {recordBelongsToSite} from "../site-location.mjs";
import {requestStatusLabel} from "../src/request-status.mjs";
import {availabilityRequestsForDate} from "../src/dashboard-availability.mjs";
import {dashboardFleetSnapshot} from "../dashboard-fleet-snapshot.mjs";
import * as displayDates from "../date-time-format.mjs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const componentSource = source.slice(source.indexOf("function Dashboard("), source.indexOf("const PRODUCTION_REQUEST_COLUMNS"));
const dateSource = source.slice(source.indexOf("function dashboardRecordDate("), source.indexOf("function useDashboardEquipment("));
const {code} = await transformWithOxc(`${dateSource}\n${componentSource}`, "Dashboard.jsx", {jsx: {runtime: "classic"}});
const Null = () => null;
const componentNames = [...new Set([...componentSource.matchAll(/<([A-Z]\w*)\b/g)].map((match) => match[1]))];
const text = (node) => Array.isArray(node) ? node.map(text).join("") : React.isValidElement(node)
  ? text(node.props.children) : typeof node === "string" || typeof node === "number" ? String(node) : "";
const findAll = (tree, predicate) => {
  const found = [];
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!React.isValidElement(node)) return;
    if (predicate(node)) found.push(node);
    visit(node.props.children);
  };
  visit(tree);
  return found;
};
const byLabel = (tree, label) => findAll(tree, (node) => node.props["aria-label"] === label)[0];
const byClass = (tree, className) => findAll(tree, (node) => node.props.className === className)[0];
const button = (tree, label) => findAll(tree, (node) => node.type === "button" && text(node).trim() === label)[0];

const assets = Object.freeze([1, 2, 3].map((id) => Object.freeze({id, door: `V${id}`, chassisNo: `C${id}`, category: "Vehicle", group: "TIPPER", currentLocation: "Sasti OB", status: "Operational"})));
const requests = Object.freeze([
  Object.freeze({ref: "OLD-OPEN", door: "V1", chassis: "C1", site: "Sasti OB", category: "Breakdown", status: "Open", start: "2026-09-01 09:00:00"}),
  Object.freeze({ref: "OLD-IDLE", door: "V2", chassis: "C2", site: "Sasti OB", category: "Breakdown", status: "Idle", start: "2026-09-01 10:00:00", idealRequestedAt: "2026-09-08T19:00:00Z"}),
  Object.freeze({ref: "NEW-CLOSED", door: "V3", chassis: "C3", site: "Sasti OB", category: "Preventive", status: "Closed", start: "2026-09-09 08:00:00", closedAt: "2026-09-09 09:00:00"}),
]);

function harness() {
  const slots = [];
  let cursor = 0;
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
  };
  const dependencies = {
    ...Object.fromEntries(componentNames.map((name) => [name, Null])),
    ...metrics, ...movement, ...actions, ...dates, ...forecast, ...model, ...displayDates,
    availabilityRequestsForDate, dashboardFleetSnapshot,
    dashboardKpiExportColumns: [],
    React, useState, useEffect() {}, useRef: (initial) => useState(() => ({current: initial}))[0],
    equipmentGroupValue, normalizeEquipmentGroup, dashboardCountScale, activeOpenCases, recordBelongsToSite, requestStatusLabel,
    localStorage: {getItem: () => null, setItem() {}},
    subsidiaryData: [{code: "WCL", sites: ["Sasti OB"]}],
    useDashboardEquipment: () => ({records: assets, loaded: true, loadError: "", scope: {restrictToScope: true, allowedSites: ["Sasti OB"], allowedRegions: ["WCL"]}}),
    firstTripTimestamp: (request) => request.firstTripAt || "",
  };
  const Dashboard = new Function(...Object.keys(dependencies), `${code}; return Dashboard;`)(...Object.values(dependencies));
  return {render(rows = requests) { cursor = 0; return Dashboard({requests: rows}); }};
}

test("compiled Dashboard retains older open and Idle assets in live status after selecting an opening date", () => {
  const view = harness();
  let tree = view.render();
  byLabel(tree, "Dashboard date").props.onChange({target: {value: "2026-09-09"}});
  tree = view.render();
  button(tree, "Availability Count").props.onClick();
  tree = view.render();
  assert.ok(byLabel(tree, "Sasti OB: 1 on road, 1 off road and 1 idle. Open fleet details."));
  const summary = byClass(tree, "mine-site-road-summary");
  assert.equal(text(byClass(summary, "offroad")), "Off road1");
  assert.equal(text(byClass(summary, "idle")), "Idle1");
  const breakdown = findAll(tree, (node) => node.type === "button" && node.props.className === "breakdown" && node.props["aria-controls"] === "fleet-region-plot")[0];
  assert.equal(text(breakdown), "Breakdown 1");
  assert.equal(requests[0].start, "2026-09-01 09:00:00");
});

test("compiled lifecycle places Idle on its actual India event day, not its old opening date", () => {
  const view = harness();
  let tree = view.render();
  byLabel(tree, "Dashboard date").props.onChange({target: {value: "2026-09-09"}});
  tree = view.render();
  assert.ok(byLabel(tree, "09-09-2026: 1 idle requests"));
  assert.ok(byLabel(tree, "08-09-2026: 0 idle requests"));
  assert.ok(byLabel(tree, "09-09-2026: 1 closed requests"));
  assert.ok(byLabel(tree, "09-09-2026: 0 verified requests"));
  const withoutIdleTime = requests.map((row) => row.ref === "OLD-IDLE" ? {...row, idealRequestedAt: ""} : row);
  tree = view.render(withoutIdleTime);
  assert.ok(byLabel(tree, "09-09-2026: 0 idle requests"));
});
