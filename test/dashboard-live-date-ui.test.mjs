import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import React from "react";
import {createPortal} from "react-dom";
import {transformWithOxc} from "vite";
import * as metrics from "../dashboard-equipment-metrics.mjs";
import * as movement from "../dashboard-breakdown-movement.mjs";
import * as dailyBalance from "../src/daily-bd-balance.mjs";
import * as actions from "../src/dashboard-card-actions.mjs";
import * as dates from "../src/dashboard-request-data.mjs";
import * as forecast from "../src/dashboard-breakdown-forecast.mjs";
import * as model from "../src/dashboard-drilldown-model.mjs";
import * as oemBreakdown from "../src/oem-breakdown-model.mjs";
import * as oemFilters from "../src/oem-dashboard-filters.mjs";
import {equipmentGroupValue, normalizeEquipmentGroup} from "../equipment-group.mjs";
import {dashboardCountScale} from "../src/dashboard-count-scale.mjs";
import {fleetBarHeightPercent} from "../src/fleet-bar-scale.mjs";
import {activeOpenCases} from "../dashboard-open-cases.mjs";
import {recordBelongsToSite} from "../site-location.mjs";
import {requestStatusLabel} from "../src/request-status.mjs";
import {availabilityRequestsForDate} from "../src/dashboard-availability.mjs";
import {dashboardFleetSnapshot} from "../dashboard-fleet-snapshot.mjs";
import * as displayDates from "../date-time-format.mjs";
import {tableModel, tableExportModel} from "../src/table-actions-model.mjs";
import {isDurationColumn, compareDurationValues} from "../src/duration-sort.mjs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const componentSource = source.slice(source.indexOf("function Dashboard("), source.indexOf("const PRODUCTION_REQUEST_COLUMNS"));
const dateSource = source.slice(source.indexOf("function dashboardRecordDate("), source.indexOf("function useDashboardEquipment("));
const sortingSource = source.slice(source.indexOf('const sortCollator ='), source.indexOf('function SortableHeader('));
const {code} = await transformWithOxc(`${dateSource}\n${sortingSource}\n${componentSource}`, "Dashboard.jsx", {jsx: {runtime: "classic"}});
const oemChartSource = readFileSync(new URL("../src/oem-breakdown-chart.jsx", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace("export default function", "function");
const {code: oemChartCode} = await transformWithOxc(oemChartSource, "OemBreakdownChart.jsx", {jsx: {runtime: "classic"}});
const OemBreakdownChart = new Function("React", "createPortal", `${oemChartCode}; return OemBreakdownChart;`)(React, createPortal);
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
    // Modal renders this supplied subtree before its children.
    visit(node.props.topBar);
    visit(node.props.children);
  };
  visit(tree);
  return found;
};
const byLabel = (tree, label) => findAll(tree, (node) => node.props["aria-label"] === label)[0];
const byClass = (tree, className) => findAll(tree, (node) => node.props.className === className)[0];
const button = (tree, label) => findAll(tree, (node) => node.type === "button" && text(node).trim() === label)[0];
const fleetCount = (tree, label) => findAll(tree, (node) => node.type === "button" && node.props.className === "mine-fleet-toggle-count" && node.props["aria-label"]?.startsWith(`View ${label} list:`))[0];
const oemChart = (tree) => findAll(tree, (node) => node.type === OemBreakdownChart)[0];
const renderOemChart = (tree) => OemBreakdownChart(oemChart(tree).props);
const oemDetails = (tree) => findAll(tree, (node) => node.props.selection?.records && node.props.ActionsTable)[0]?.props;
const assertOemFilters = (tree, {region, site, oem}) => {
  for (const [label, value] of [["Region", region], ["Site", site], ["OEM", oem]]) {
    const controls = findAll(tree, (node) => node.props["aria-label"] === label);
    assert.ok(controls.length, `${label} is visible`);
    for (const control of controls) assert.equal(control.props.value, value, `${label} stays shared by the dashboard and dialog`);
  }
};
const clickOem = (control) => {
  assert.ok(control, "OEM action exists");
  let stopped = false;
  control.props.onClick({stopPropagation() { stopped = true; }});
  assert.ok(stopped, "the chart action stops propagation");
};

const assets = Object.freeze([1, 2, 3].map((id) => Object.freeze({id, door: `V${id}`, chassisNo: `C${id}`, category: "Vehicle", group: "TIPPER", currentLocation: "Sasti OB", status: "Operational"})));
const requests = Object.freeze([
  Object.freeze({ref: "OLD-OPEN", door: "V1", chassis: "C1", site: "Sasti OB", category: "Breakdown", status: "Open", start: "2026-09-01 09:00:00"}),
  Object.freeze({ref: "OLD-IDLE", door: "V2", chassis: "C2", site: "Sasti OB", category: "Breakdown", status: "Idle", start: "2026-09-01 10:00:00", idealRequestedAt: "2026-09-08T19:00:00Z"}),
  Object.freeze({ref: "NEW-CLOSED", door: "V3", chassis: "C3", site: "Sasti OB", category: "Preventive", status: "Closed", start: "2026-09-09 08:00:00", closedAt: "2026-09-09 09:00:00"}),
]);

const todayKey = new Date().toLocaleDateString("en-CA");
const todayLabel = displayDates.formatDisplayDate(todayKey);
const liveAvailabilityCaption = `All timeAvailability: live · ${todayLabel}`;
const todayCaption = `From: ${todayLabel}To: ${todayLabel}Availability: live · ${todayLabel}`;
// Set the top From and To to one day, re-rendering between the two inputs.
const setDashboardDate = (view, value, rows) => {
  let tree = view.render(rows);
  byLabel(tree, "Dashboard from date").props.onChange({target: {value}});
  tree = view.render(rows);
  byLabel(tree, "Dashboard to date").props.onChange({target: {value}});
  return view.render(rows);
};
const setLifecycleFrom = (view, value, rows) => {
  const tree = view.render(rows);
  byLabel(tree, "Request lifecycle from date").props.onChange({target: {value}});
  return view.render(rows);
};

test("BD In components appear only for default today and return on reset", () => {
  const rows = [
    {ref: "OPENING", site: "Sasti OB", status: "Open", start: "2020-01-01 09:00", category: "Breakdown"},
    {ref: "NEW", site: "Sasti OB", status: "Open", start: `${todayKey} 09:00`, category: "Breakdown"},
  ];
  const view = harness();
  let tree = view.render(rows);
  assert.match(text(byLabel(tree, "BD In opening and new counts")), /Opening: 1 \+ New: 1/);
  byLabel(tree, "Site-wise BD from date").props.onChange({target: {value: "2026-09-01"}});
  tree = view.render(rows);
  assert.equal(byLabel(tree, "BD In opening and new counts"), undefined);
  button(tree, "Reset dates").props.onClick();
  tree = view.render(rows);
  assert.ok(byLabel(tree, "BD In opening and new counts"));
  byLabel(tree, "Site-wise BD to date").props.onChange({target: {value: todayKey}});
  tree = view.render(rows);
  assert.equal(byLabel(tree, "BD In opening and new counts"), undefined);
});

test("dashboard From/To default to today as the live view and only an earlier range filters", () => {
  const view = harness();
  let tree = view.render();
  assert.equal(byLabel(tree, "Dashboard from date").props.value, todayKey);
  assert.equal(byLabel(tree, "Dashboard to date").props.value, todayKey);
  assert.equal(byLabel(tree, "Dashboard to date").props.max, todayKey);
  assert.ok(text(byClass(tree, "mine-updated")).endsWith(` · ${todayLabel}`));
  // Today's range is applied: only requests opened today count as historical analysis.
  byLabel(tree, "Dashboard from date").props.onChange({target: {value: "2026-09-01"}});
  tree = view.render();
  assert.equal(byLabel(tree, "Dashboard from date").props.value, "2026-09-01");
  assert.equal(byLabel(tree, "Dashboard to date").props.value, todayKey);
  assert.ok(text(byClass(tree, "mine-updated")).startsWith(" Live · "));
  assert.ok(text(byClass(tree, "mine-updated")).includes(displayDates.formatDisplayDateRange("2026-09-01", todayKey)));
  byLabel(tree, "Dashboard to date").props.onChange({target: {value: "9999-12-31"}});
  tree = view.render();
  assert.equal(byLabel(tree, "Dashboard to date").props.value, todayKey);
  tree = setDashboardDate(view, todayKey);
  assert.ok(text(byClass(tree, "mine-updated")).startsWith(" Live · "));
  assert.ok(button(tree, "BD (%) 33.3"), "site summary shows BD balance as a share of total fleet");
  tree = setDashboardDate(view, "2026-09-09");
  assert.ok(text(byClass(tree, "mine-updated")).startsWith(" Filtered · "));
  tree = setDashboardDate(view, todayKey);
  assert.ok(text(byClass(tree, "mine-updated")).startsWith(" Live · "));
});

test("every dashboard date filter starts on today, availability follows the To date and Reset restores today", () => {
  const view = harness();
  let tree = view.render();
  assert.equal(byLabel(tree, "Site-wise BD from date").props.value, todayKey);
  assert.equal(byLabel(tree, "Site-wise BD to date").props.value, todayKey);
  assert.equal(byLabel(tree, "Dashboard from date").props.value, todayKey);
  assert.equal(byLabel(tree, "Dashboard to date").props.value, todayKey);
  assert.equal(byLabel(tree, "Breakdown trend from date").props.value, todayKey);
  assert.equal(byLabel(tree, "Breakdown trend to date").props.value, todayKey);
  assert.ok(byLabel(tree, "1 day recorded breakdown chart"));
  assert.equal(byLabel(tree, "Request lifecycle from date").props.value, todayKey);
  assert.equal(byLabel(tree, "Request lifecycle to date").props.value, todayKey);
  assert.ok(findAll(tree, (node) => node.type === "p" && text(node) === displayDates.formatDisplayDateRange(todayKey, todayKey, " - ")).length, "lifecycle range shows today only");
  assert.equal(text(byLabel(tree, "Site-wise BD table period")), todayCaption);
  assert.ok(text(byLabel(tree, "Site-wise breakdown opening, inward, outward and balance")).includes(`Availability count impact${todayLabel}`));
  assert.ok(!findAll(tree, (node) => node.props["aria-label"] === "Availability count date").length, "no separate availability date input");
  assert.equal(button(tree, "Reset dates").props.disabled, true);
  assert.match(byClass(tree, "mine-breakdown-site-row").props["aria-label"], /2 open, 0 in, 0 out, 2 balance; .*1 on road, 1 off road and 1 idle/);
  byLabel(tree, "Site-wise BD to date").props.onChange({target: {value: "2026-09-08"}});
  tree = view.render();
  assert.equal(byLabel(tree, "Site-wise BD from date").props.value, "2026-09-08");
  assert.match(byClass(tree, "mine-breakdown-site-row").props["aria-label"], /1 on road, 2 off road and 0 idle/);
  assert.equal(text(byLabel(tree, "Site-wise BD table period")), "From: 08-09-2026To: 08-09-2026Availability as of 08-09-2026");
  assert.ok(text(byLabel(tree, "Site-wise breakdown opening, inward, outward and balance")).includes("Availability count impact08-09-2026"));
  button(tree, "Availability Count").props.onClick();
  tree = view.render();
  assert.equal(text(byLabel(tree, "Availability table period")), "From: 08-09-2026To: 08-09-2026Availability as of 08-09-2026");
  button(tree, "Reset dates").props.onClick();
  tree = view.render();
  assert.equal(byLabel(tree, "Site-wise BD from date").props.value, todayKey);
  assert.equal(byLabel(tree, "Site-wise BD to date").props.value, todayKey);
  assert.equal(text(byLabel(tree, "Availability table period")), todayCaption);
  assert.equal(button(tree, "Reset dates").props.disabled, true);
});

function harness({equipment = assets, regions = [{code: "WCL", sites: ["Sasti OB"]}], allowedSites = ["Sasti OB"], restrictToScope = true, equipmentState = {}, initialMode = "breakdown"} = {}) {
  const slots = [];
  let cursor = 0;
  let initialized = false;
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
  };
  const dependencies = {
    FilterableHeader() {},
    openHourlyBreakdownTab() {},
    isDurationColumn, compareDurationValues,
    ...Object.fromEntries(componentNames.map((name) => [name, Null])),
    OemBreakdownChart,
    ...metrics, ...movement, ...dailyBalance, ...actions, ...dates, ...forecast, ...model, ...displayDates, ...oemBreakdown, ...oemFilters,
    availabilityRequestsForDate, dashboardFleetSnapshot,
    dashboardKpiExportColumns: [],
    React, useState, useEffect() {}, useMemo: (calculate) => calculate(), useRef: (initial) => useState(() => ({current: initial}))[0],
    equipmentGroupValue, normalizeEquipmentGroup, dashboardCountScale, fleetBarHeightPercent, activeOpenCases, recordBelongsToSite, requestStatusLabel,
    localStorage: {getItem: () => null, setItem() {}},
    subsidiaryData: regions,
    useDashboardEquipment: () => ({records: equipment, loaded: true, loadError: "", scope: {restrictToScope, allowedSites, allowedRegions: regions.map(({code}) => code)}, ...equipmentState}),
    firstTripTimestamp: (request) => request.firstTripAt || "",
    formatTwelveHourDateTime: displayDates.formatDisplayDateTime,
    Status: Null,
    RequestTimelineButton: Null, authToken: "",
    MaintenanceRemarks: Null,
  };
  const Dashboard = new Function(...Object.keys(dependencies), `${code}; return Dashboard;`)(...Object.values(dependencies));
  return {render(rows = requests, props = {}) {
    cursor = 0;
    let tree = Dashboard({requests: rows, ...props});
    if (!initialized) {
      initialized = true;
      // Existing breakdown tests enter that view through its normal label action.
      if (initialMode) {
        button(byLabel(tree, "Fleet chart view"), initialMode === "oem" ? "OEM BD" : initialMode === "total" ? "Total" : "Breakdown").props.onClick();
        cursor = 0;
        tree = Dashboard({requests: rows, ...props});
      }
    }
    return tree;
  }};
}

for (const resource of ["requests", "equipment"]) test(`dashboard ${resource} failure keeps cards, filters and drilldown mounted without a Live label`, () => {
  const equipmentState = {updatedAt: 1788854300000};
  const view = harness({equipmentState});
  const props = {requestsUpdatedAt: 1788854400000};
  let tree = view.render(requests, props);
  byLabel(tree, "Region").props.onChange({target: {value: "WCL"}});
  tree = view.render(requests, props);
  fleetCount(tree, "Total").props.onClick();
  tree = view.render(requests, props);
  const originalRows = detailView(tree).rows;
  assert.match(text(byClass(tree, "mine-updated")), /Live/);
  if (resource === "equipment") equipmentState.loadError = "Network unavailable";
  const failureProps = {...props, requestsError: resource === "requests" ? "Network unavailable" : ""};
  tree = view.render(requests, failureProps);
  assert.equal(byLabel(tree, "Region").props.value, "WCL");
  assert.deepEqual(detailView(tree).rows, originalRows);
  assert.ok(byClass(tree, "mine-fleet-chart-plot"));
  assert.match(text(byClass(tree, "mine-updated")), /Reconnecting/);
  assert.doesNotMatch(text(tree), /\blive\b/i);
  const notice = findAll(tree, (node) => typeof node.props.retry === "function" && node.props.updatedAt)[0];
  assert.equal(notice.props.updatedAt, equipmentState.updatedAt);
  equipmentState.loadError = "";
  tree = view.render(requests, props);
  assert.match(text(byClass(tree, "mine-updated")), /Live/);
  assert.deepEqual(detailView(tree).rows, originalRows);
  assert.equal(findAll(tree, (node) => typeof node.props.retry === "function" && node.props.updatedAt).length, 0);
});

const oemEquipment = [
  ["Sasti OB", "Tata"], ["Sasti OB", "Volvo"], ["Majri OB", "Volvo"],
  ["Jayant OB", "Tata"], ["Jayant OB", "Volvo"], ["Sasti OB", "Tata"], ["Sasti OB", "Tata"],
].map(([currentLocation, make], index) => Object.freeze({...assets[0], id: index + 1, door: `V${index + 1}`, chassisNo: `C${index + 1}`, currentLocation, make}));
const oemRequests = [...oemEquipment.slice(0, 5).map(asset => Object.freeze({
  ref: `BD-${asset.id}`, door: asset.door, chassis: asset.chassisNo, site: asset.currentLocation,
  category: "Breakdown", status: "Open", start: "2026-09-01 09:00:00",
})), Object.freeze({ref: "HISTORICAL", door: "V7", chassis: "C7", site: "Sasti OB", category: "Breakdown", status: "Closed", start: "2026-09-08 09:00:00", closedAt: "2026-09-09 12:00:00"})];
const oemHarnessOptions = {equipment: oemEquipment, regions: [{code: "WCL", sites: ["Sasti OB", "Majri OB"]}, {code: "NCL", sites: ["Jayant OB"]}], allowedSites: [], restrictToScope: false, initialMode: "oem"};

test("dashboard opens in Breakdown by default", () => {
  const view = harness({...oemHarnessOptions, initialMode: null});
  const tree = view.render(oemRequests);
  assert.equal(button(byLabel(tree, "Fleet chart view"), "Breakdown").props["aria-pressed"], true);
});

test("OEM view retains today's shared filters and separate label and count actions", () => {
  const view = harness({...oemHarnessOptions, initialMode: "oem"});
  let tree = view.render(oemRequests);
  assertOemFilters(tree, {region: "all", site: "all", oem: "all"});
  assert.equal(byLabel(tree, "Dashboard from date").props.value, todayKey);
  assert.equal(byLabel(tree, "Dashboard to date").props.value, todayKey);
  assert.equal(button(byLabel(tree, "Fleet chart view"), "OEM BD").props["aria-pressed"], true);
  assert.equal(oemChart(tree).props.chart.rows.length, 5);
  assert.equal(text(fleetCount(tree, "OEM BD")), "5");
  assert.equal(text(fleetCount(tree, "Total")), "7");
  assert.equal(byClass(tree, "mine-panel mine-request-lifecycle"), undefined);
  assert.equal(byLabel(tree, "Tracking vehicle throughput"), undefined);
  assert.equal(oemDetails(tree), undefined);
  for (const label of ["Total", "Breakdown", "OEM BD"]) {
    button(byLabel(tree, "Fleet chart view"), label).props.onClick();
    tree = view.render(oemRequests);
    assert.equal(button(byLabel(tree, "Fleet chart view"), label).props["aria-pressed"], true);
    assert.equal(oemDetails(tree), undefined, "view labels do not open a list");
    assert.equal(byClass(tree, "dashboard-asset-modal"), undefined);
    assert.equal(tree.props.onBack, undefined, "view labels do not open hourly activity");
  }
});

test("OEM segments, site totals and legend actions update the shared region, site and OEM filters", () => {
  const cases = [
    ["Sasti OB · Tata: 1 breakdown assets, view details", "WCL", "Sasti OB", "tata", ["BD-1"]],
    ["Sasti OB · Volvo: 1 breakdown assets, view details", "WCL", "Sasti OB", "volvo", ["BD-2"]],
    ["Majri OB · Volvo: 1 breakdown assets, view details", "WCL", "Majri OB", "volvo", ["BD-3"]],
    ["Jayant OB · Tata: 1 breakdown assets, view details", "NCL", "Jayant OB", "tata", ["BD-4"]],
    ["Jayant OB · Volvo: 1 breakdown assets, view details", "NCL", "Jayant OB", "volvo", ["BD-5"]],
    ["Sasti OB: 2 breakdown assets, view all OEMs", "WCL", "Sasti OB", "all", ["BD-1", "BD-2"]],
    ["Volvo: 3 breakdown assets, view details", "all", "all", "volvo", ["BD-2", "BD-3", "BD-5"]],
  ];
  for (const [label, region, site, oem, references] of cases) {
    const view = harness(oemHarnessOptions);
    let tree = view.render(oemRequests);
    clickOem(byLabel(renderOemChart(tree), label));
    tree = view.render(oemRequests);
    assertOemFilters(tree, {region, site, oem});
    assert.equal(findAll(tree, node => node.props["aria-label"] === "OEM").length, 2, "the open list exposes the same header filters");
    assert.deepEqual(oemDetails(tree).selection.records.map(row => row.requestReference), references);
    assert.equal(oemDetails(tree).selection.rows.length, references.length);
    assert.equal(oemChart(tree).props.chart.rows.length, references.length);
    assert.equal(text(fleetCount(tree, "OEM BD")), String(references.length));
    assert.ok(oemDetails(tree).title.includes(site === "all" ? "All selected sites" : site));
  }
});

test("an open OEM list follows refreshed requests and shared OEM, site, region and date changes", () => {
  const view = harness(oemHarnessOptions);
  let tree = view.render(oemRequests);
  clickOem(byLabel(renderOemChart(tree), "Sasti OB · Tata: 1 breakdown assets, view details"));
  tree = view.render(oemRequests);
  const assertReferences = expected => assert.deepEqual(oemDetails(tree).selection.records.map(row => row.requestReference), expected);
  assertReferences(["BD-1"]);
  const refreshed = [...oemRequests, {...oemRequests[0], ref: "LATER"}];
  tree = view.render(refreshed);
  assertReferences(["BD-1", "LATER"]);
  assert.equal(oemDetails(tree).selection.rows.length, 1, "multiple requests keep a single counted asset");
  assert.equal(text(fleetCount(tree, "OEM BD")), "1");

  tree = setDashboardDate(view, "2026-09-08", refreshed);
  assertReferences(["BD-1", "LATER", "HISTORICAL"]);
  assert.equal(oemDetails(tree).selection.periodLabel, "08-09-2026");
  assert.equal(text(fleetCount(tree, "OEM BD")), "2");
  tree = setDashboardDate(view, todayKey, refreshed);
  assertReferences(["BD-1", "LATER"]);

  byLabel(tree, "OEM").props.onChange({target: {value: "volvo"}});
  tree = view.render(refreshed);
  assertOemFilters(tree, {region: "WCL", site: "Sasti OB", oem: "volvo"});
  assertReferences(["BD-2"]);
  byLabel(tree, "Site").props.onChange({target: {value: "Majri OB"}});
  tree = view.render(refreshed);
  assertReferences(["BD-3"]);
  byLabel(tree, "Region").props.onChange({target: {value: "NCL"}});
  tree = view.render(refreshed);
  assertOemFilters(tree, {region: "NCL", site: "all", oem: "volvo"});
  assertReferences(["BD-5"]);
  // Editing the dialog's copy also changes the dashboard header and chart.
  const dialogOem = findAll(tree, node => node.props["aria-label"] === "OEM").at(-1);
  dialogOem.props.onChange({target: {value: "tata"}});
  tree = view.render(refreshed);
  assertOemFilters(tree, {region: "NCL", site: "all", oem: "tata"});
  assertReferences(["BD-4"]);
  const closed = refreshed.map(row => row.ref === "BD-4" ? {...row, status: "Closed", closedAt: "2026-09-10 12:00:00"} : row);
  tree = view.render(closed);
  assertReferences([]);
  assert.equal(text(fleetCount(tree, "OEM BD")), "0");
});

test("OEM full-list and numeric count actions preserve shared filters and open the displayed assets", () => {
  const controls = [
    [tree => button(renderOemChart(tree), "View full list 2"), false, true],
    [tree => byClass(renderOemChart(tree), "mine-oem-all"), false, true],
    [tree => fleetCount(tree, "OEM BD"), false, false],
    [tree => fleetCount(tree, "Breakdown"), false, false],
    [tree => fleetCount(tree, "Total"), true, false],
    [tree => byLabel(renderOemChart(tree), "Sasti OB: 2 breakdown assets, view details"), false, true],
  ];
  for (const [control, fleetOnly, chartAction] of controls) {
    const view = harness(oemHarnessOptions);
    let tree = setDashboardDate(view, "2026-09-08", oemRequests);
    byLabel(tree, "Site").props.onChange({target: {value: "Sasti OB"}});
    tree = view.render(oemRequests);
    byLabel(tree, "OEM").props.onChange({target: {value: "tata"}});
    tree = view.render(oemRequests);
    assertOemFilters(tree, {region: "all", site: "Sasti OB", oem: "tata"});
    assert.equal(oemDetails(tree), undefined, "filter changes alone do not open a list");
    const action = control(tree);
    if (chartAction) clickOem(action);
    else {
      assert.equal(text(action), fleetOnly ? "3" : "2");
      action.props.onClick();
    }
    tree = view.render(oemRequests);
    const isSiteTotal = action.props.className === "mine-oem-total";
    assertOemFilters(tree, {region: isSiteTotal ? "WCL" : "all", site: "Sasti OB", oem: "tata"});
    assert.equal(byLabel(tree, "Dashboard from date").props.value, "2026-09-08");
    assert.equal(byLabel(tree, "Dashboard to date").props.value, "2026-09-08");
    assert.equal(button(byLabel(tree, "Fleet chart view"), "OEM BD").props["aria-pressed"], true);
    assert.equal(tree.props.onBack, undefined, "OEM counts keep the dashboard open");
    const selection = oemDetails(tree).selection;
    assert.equal(selection.fleetOnly, fleetOnly);
    assert.equal(selection.rows.length, fleetOnly ? 3 : 2);
    assert.ok(selection.records.every(row => row.make === "Tata"));
    if (fleetOnly) {
      assert.deepEqual(selection.records.map(row => row.door), ["V1", "V6", "V7"]);
      assert.ok(selection.records.every(row => row.currentLocation === "Sasti OB"));
    } else {
      assert.ok(selection.records.every(row => row.requestSite === "Sasti OB"));
      assert.deepEqual(selection.records.map(row => row.requestReference), ["BD-1", "HISTORICAL"]);
    }
  }
});

test("OEM panel, plain heading and chart backgrounds have no list action; its count opens the list from Breakdown", () => {
  const view = harness(oemHarnessOptions);
  let tree = view.render(oemRequests);
  const panel = byLabel(tree, "OEM breakdown by region and site graph");
  const heading = findAll(panel, node => node.type === "h2")[0];
  assert.equal(text(heading), "OEM BD");
  assert.equal(byClass(tree, "mine-fleet-chart-title"), undefined);
  const chart = renderOemChart(tree);
  const backgrounds = [panel, heading, ...findAll(panel, node => node.type === "header" || node.props.className === "mine-fleet-chart-heading"), chart,
    ...findAll(chart, node => ["mine-oem-chart-layout", "mine-oem-sites", "mine-oem-grid", "mine-oem-bar-track", "mine-oem-stack"].includes(node.props.className))];
  assert.ok(backgrounds.length > 8);
  for (const background of backgrounds) {
    assert.equal(background.props.onClick, undefined);
    assert.equal(background.props.onKeyDown, undefined);
    assert.equal(background.props["data-dashboard-list"], undefined);
    assert.notEqual(background.props.role, "button");
  }
  assert.equal(oemDetails(view.render(oemRequests)), undefined);
  button(byLabel(tree, "Fleet chart view"), "Breakdown").props.onClick();
  tree = view.render(oemRequests);
  fleetCount(tree, "OEM BD").props.onClick();
  tree = view.render(oemRequests);
  assert.equal(button(byLabel(tree, "Fleet chart view"), "OEM BD").props["aria-pressed"], true);
  assert.deepEqual(oemDetails(tree).selection.records.map(row => row.requestReference), ["BD-1", "BD-2", "BD-3", "BD-4", "BD-5"]);
});

// Check the actual final browser filtering, not just the Dashboard's input props.
const detailView = (tree) => {
  const props = findAll(tree, (node) => Array.isArray(node.props.rows) && Array.isArray(node.props.regions))[0].props;
  return model.drilldownView(props.rows, props.regions, {region: props.initialRegion, site: props.initialSite}, {rowsAreScoped: props.rowsAreScoped});
};

test("daily BD chart sits directly below Total Fleet and every metric opens its exact scoped requests", () => {
  const rows = [...requests, {ref: "MAJRI", site: "Majri OB", start: "2026-09-09 12:00", status: "Open"}];
  const view = harness({regions: [{code: "WCL", sites: ["Sasti OB", "Majri OB"]}], allowedSites: [], restrictToScope: false});
  let tree = setDashboardDate(view, "2026-09-09", rows);
  const chart = node => findAll(node, item => typeof item.props.onInspect === "function" && item.props.today)[0];
  const siblings = React.Children.toArray(byClass(tree, "mine-dashboard-feature-row").props.children);
  assert.match(siblings[0].props.className, /mine-fleet-region-chart/);
  assert.equal(siblings[1].props, chart(tree).props);
  assert.match(siblings[2].props.className, /mine-maintenance-availability-panel/);
  assert.deepEqual(chart(tree).props.records, rows, "top opening-date filter must not discard carried history");
  for (const site of ["", "Sasti OB", "Majri OB"]) {
    const scope = site ? rows.filter(row => recordBelongsToSite(row, site)) : rows;
    for (const {key} of dailyBalance.DAILY_BD_METRICS) {
      chart(tree).props.onInspect(key, "2026-09-09", "2026-09-09", site);
      tree = view.render(rows);
      const expected = dailyBalance.dailyBdRecordsForMetric(scope, "2026-09-09", "2026-09-09", key).map(row => row.ref).sort();
      assert.deepEqual(detailView(tree).rows.map(row => row.requestReference).sort(), expected, `${site || "All sites"}: ${key}`);
      const browser = findAll(tree, node => Array.isArray(node.props.rows) && Array.isArray(node.props.regions))[0];
      assert.equal(browser.props.requestRecords, true);
      assert.equal(browser.props.showBdClosingTime, key === "outgoing");
      if (key === "outgoing" && expected.length) assert.equal(browser.props.rows[0].requestClosed, "2026-09-09 09:00:00");
    }
  }
});

test("daily BD chart and linked rows respect assigned sites before any local selection", () => {
  const view = harness();
  const rows = [...requests, {ref: "OTHER-SITE", site: "Majri OB", status: "Open", start: "2026-09-09 12:00"}];
  let tree = view.render(rows);
  const chart = findAll(tree, node => typeof node.props.onInspect === "function" && node.props.today)[0];
  assert.deepEqual(chart.props.records, requests);
  assert.deepEqual(chart.props.sites, ["Sasti OB"]);
  chart.props.onInspect("incoming", "2026-09-01", "2026-09-10", "");
  tree = view.render(rows);
  assert.deepEqual(detailView(tree).rows.map(row => row.requestReference).sort(), requests.map(row => row.ref).sort());
});

const activate = (node) => {
  const target = {};
  if (node.props["data-dashboard-list"]) node.props.onKeyDown({key: "Enter", currentTarget: target, target, preventDefault() {}, stopPropagation() {}});
  else node.props.onClick();
};

test("lifecycle region filters its cards and linked rows independently of the dashboard", () => {
  const equipment = [...assets, {id: 4, door: "N1", category: "Vehicle", currentLocation: "Jayant OB", status: "Operational"}];
  const rows = [
    {ref: "WCL-OPEN", site: "Sasti OB", door: "V1", status: "Open"},
    {ref: "WCL-CLOSED", site: "Sasti OB", door: "V3", status: "Closed", closedAt: "2026-09-09 12:00:00"},
    {ref: "NCL-OPEN", site: "Jayant OB", door: "N1", status: "Open"},
    {ref: "NCL-CLOSED", site: "Jayant OB", status: "Closed", closedAt: "2026-09-09 12:00:00"},
  ].map((row) => ({...row, requesterRole: "Production User", start: "2026-09-09 08:00:00", category: "Breakdown"}));
  const view = harness({equipment, regions: [{code: "WCL", sites: ["Sasti OB"]}, {code: "NCL", sites: ["Jayant OB"]}], allowedSites: [], restrictToScope: false});
  let tree = view.render(rows);
  tree = setDashboardDate(view, "2026-09-09", rows);
  tree = setLifecycleFrom(view, "2026-09-01", rows);
  const controls = byClass(tree, "mine-request-lifecycle-end-controls");
  assert.ok(byLabel(controls, "Request lifecycle to date"));
  assert.ok(byLabel(controls, "Request lifecycle region"));
  for (const region of ["NCL", "WCL", "site:Jayant OB", "site:Sasti OB", "all"]) {
    byLabel(tree, "Request lifecycle region").props.onChange({target: {value: region}});
    tree = view.render(rows);
    assert.equal(byLabel(tree, "Region").props.value, "all");
    const summary = byClass(tree, "mine-request-lifecycle-summary");
    activate(byClass(summary, "opened"));
    tree = view.render(rows);
    const expected = rows.filter((row) => region === "all" || (region.startsWith("site:") ? row.site === region.slice(5) : row.ref.startsWith(region))).map((row) => row.ref);
    assert.deepEqual(detailView(tree).rows.map((row) => row.requestReference), expected);
    activate(byClass(byClass(tree, "mine-request-lifecycle-summary"), "closed"));
    tree = view.render(rows);
    assert.deepEqual(detailView(tree).rows.map((row) => row.requestReference), expected.filter((ref) => ref.endsWith("CLOSED")));
  }
  byLabel(tree, "Region").props.onChange({target: {value: "WCL"}});
  tree = view.render(rows);
  assert.deepEqual(findAll(byLabel(tree, "Request lifecycle region"), (node) => node.type === "option").map((node) => node.props.value), ["all", "WCL", "site:Sasti OB"]);
  const restricted = harness({equipment, regions: [{code: "WCL", sites: ["Sasti OB", "Majri OB"]}, {code: "NCL", sites: ["Jayant OB"]}], allowedSites: ["Sasti OB"], restrictToScope: true});
  assert.deepEqual(findAll(byLabel(restricted.render(rows), "Request lifecycle region"), (node) => node.type === "option").map((node) => node.props.value), ["all", "WCL", "site:Sasti OB"]);
});

test("every day-wise date, metric and percentage opens its exact site/day entries and returns to the table", () => {
  const rows = [
    ...Array.from({length: 7}, (_, i) => ({ref: `OPEN-${i}`, site: "Sasti OB", start: "2026-09-05 09:00", status: "Open"})),
    ...Array.from({length: 14}, (_, i) => ({ref: `IN-${i}`, site: "Sasti OB", start: "2026-09-06 09:00", status: i < 12 ? "Closed" : "Open", closedAt: i < 12 ? "2026-09-06 18:00" : ""})),
    {ref: "PREVIOUS", site: "Sasti OB", start: "2026-09-01", closedAt: "2026-09-05", status: "Closed"},
    {ref: "NEXT-DAY", site: "Sasti OB", start: "2026-09-07", closedAt: "2026-09-08", status: "Closed"},
    {ref: "OTHER-SITE", site: "Majri OB", start: "2026-09-06", status: "Open"},
  ].map(Object.freeze);
  const view = harness();
  let tree = view.render(rows);
  byLabel(tree, "Site-wise BD from date").props.onChange({target: {value: "2026-09-06"}});
  byLabel(tree, "Site-wise BD to date").props.onChange({target: {value: "2026-09-08"}});
  tree = view.render(rows);
  byClass(tree, "mine-breakdown-site-row").props.onClick(); tree = view.render(rows);
  const expectedDays = movement.dailyBreakdownMovement(rows.filter(row => row.site === "Sasti OB"), "2026-09-06", "2026-09-08");
  assert.equal(expectedDays[0].open, 7);
  for (const day of expectedDays) {
    for (const metric of ["all", "open", "incoming", "outgoing", "balance", "percentage"]) {
      const tableRow = findAll(byClass(tree, "dashboard-breakdown-day-table"), node => node.type === "tr" && node.key === day.date)[0];
      const cells = findAll(tableRow, node => node.type === "button");
      cells[["all", "open", "incoming", "outgoing", "balance", "percentage"].indexOf(metric)].props.onClick();
      tree = view.render(rows);
      assert.equal(byClass(tree, "dashboard-breakdown-day-table"), undefined, "only one drilldown dialog is open");
      const expected = actions.movementRequestRows(rows.filter(row => row.site === "Sasti OB"), day.date, day.date, metric === "percentage" ? "balance" : metric);
      assert.deepEqual(detailView(tree).rows.map(row => row.requestReference), expected.map(row => row.ref), `${day.date} ${metric}`);
      if (metric !== "all") assert.equal(detailView(tree).rows.length, day[metric === "percentage" ? "balance" : metric]);
      const modal = byClass(tree, "dashboard-asset-modal");
      assert.ok(text(modal.props.title).includes(displayDates.formatDisplayDate(day.date)));
      assert.ok(text(modal.props.title).startsWith("Sasti OB"));
      // Both the explicit Back action and the close/X action restore the same range.
      if (metric === "percentage") modal.props.close();
      else button(tree, "Back to day-wise report").props.onClick();
      tree = view.render(rows);
      assert.equal(byLabel(tree, "Breakdown movement from date").props.value, "2026-09-06");
      assert.equal(byLabel(tree, "Breakdown movement to date").props.value, "2026-09-08");
    }
  }
  assert.equal(rows[0].status, "Open");
});

test("day movement headings and Actions sort dates chronologically and all metrics numerically; exports keep that order", () => {
  const rows = [
    ...Array.from({length: 10}, (_, i) => ({ref: `A-${i}`, site: "Sasti OB", start: "2026-08-30", closedAt: "2026-09-01", status: "Closed"})),
    ...Array.from({length: 2}, (_, i) => ({ref: `B-${i}`, site: "Sasti OB", start: "2026-08-31", closedAt: "2026-09-02", status: "Closed"})),
  ];
  const view = harness();
  let tree = view.render(rows);
  byLabel(tree, "Site-wise BD from date").props.onChange({target: {value: "2026-08-30"}});
  tree = view.render(rows);
  byLabel(tree, "Site-wise BD to date").props.onChange({target: {value: "2026-09-02"}});
  tree = view.render(rows); byClass(tree, "mine-breakdown-site-row").props.onClick(); tree = view.render(rows);
  const expectedDays = movement.dailyBreakdownMovement(rows, "2026-08-30", "2026-09-02");
  for (const key of ["date", "open", "incoming", "outgoing", "balance", "percentage"]) {
    for (const direction of ["asc", "desc"]) {
      const header = findAll(byClass(tree, "dashboard-breakdown-day-table"), node => node.props.sortKey === key)[0];
      header.props.onSort(key, direction); tree = view.render(rows);
      const table = byClass(tree, "dashboard-breakdown-day-table").props.children;
      const dataRows = findAll(table, node => node.type === "tr" && node.key);
      const values = dataRows.map(row => expectedDays.find(day => day.date === row.key)[key === "percentage" ? "balance" : key]);
      const ordered = [...values].sort((a, b) => (key === "date" ? a.localeCompare(b) : a - b) * (direction === "asc" ? 1 : -1));
      assert.deepEqual(values, ordered, `${key} ${direction}`);
      const schema = tableModel(table.props.children);
      const exported = tableExportModel(dataRows, schema.columns, schema.columns.map(column => column.key));
      assert.deepEqual(exported.rows.map(row => row.key), dataRows.map(row => row.key));
      assert.ok(table.props.exportTitle.includes("30-08-2026 to 02-09-2026"));
    }
    // Clicking the header toggles direction without requesting a sort dialog.
    const header = findAll(byClass(tree, "dashboard-breakdown-day-table"), node => node.props.sortKey === key)[0];
    header.props.onSort(key); tree = view.render(rows);
    assert.equal(findAll(byClass(tree, "dashboard-breakdown-day-table"), node => node.props.sortKey === key)[0].props.sort.direction, "asc");
  }
});

test("six-reading Closed and MIS bars match their pending request cards", () => {
  const rows = [
    {ref: "PENDING", site: "Sasti OB", status: "Closed", category: "Breakdown", start: "2026-09-08 09:00", closedAt: "2026-09-09 10:00"},
    {ref: "VERIFIED", site: "Sasti OB", status: "Closed", category: "Breakdown", start: "2026-09-08 09:00", closedAt: "2026-09-09 11:00", verifiedAt: "2026-09-09T12:00:00Z"},
  ];
  const view = harness();
  let tree = view.render(rows);
  tree = setDashboardDate(view, "2026-09-09", rows);
  tree = setLifecycleFrom(view, "2026-09-01", rows);
  assert.ok(byLabel(tree, "09-09-2026: 0 Open in Maintenance requests"));
  byLabel(tree, "09-09-2026: 1 Open in MIS requests").props.onClick();
  tree = view.render(rows);
  assert.equal(detailView(tree).rows.length, 1);
  const pending = findAll(tree, (node) => node.type === "button" && text(node).includes("Open in MIS"))[0];
  assert.match(text(pending), /1$/);
  pending.props.onClick();
  tree = view.render(rows);
  assert.deepEqual(detailView(tree).rows.map(({requestReference}) => requestReference), ["PENDING"]);
});

test("fleet category, group, status and breakdown counts match final lists across two regions and unknown sites", () => {
  const equipment = [
    ...assets,
    {id: 4, door: "E4", category: "Equipment", group: "TIPPER", currentLocation: "Jayant OB", status: "Operational"},
    {id: 5, door: "E5", category: "Equipment", group: "TIPPER", currentLocation: "Former workshop", status: "Operational"},
  ];
  const view = harness({equipment, regions: [{code: "WCL", sites: ["Sasti OB"]}, {code: "NCL", sites: ["Jayant OB"]}], allowedSites: [], restrictToScope: false});
  let tree = view.render();
  // The same group name in equipment and vehicles must not combine category slices.
  for (const cls of ["mine-hierarchy-categories", "mine-hierarchy-groups"]) {
    const cards = findAll(byClass(tree, cls), (node) => node.type === "button");
    for (const card of cards) {
      const expected = Number(text(findAll(card, (node) => node.type === "strong")[0]));
      activate(card); tree = view.render();
      assert.equal(detailView(tree).rows.length, expected, text(card));
    }
  }
  button(tree, "Availability Count").props.onClick(); tree = view.render();
  for (const cls of ["onroad", "offroad", "idle"]) {
    const card = byClass(byClass(tree, "mine-site-road-summary"), cls);
    const expected = Number(text(findAll(card, (node) => node.type === "strong")[0]));
    activate(card); tree = view.render();
    assert.equal(detailView(tree).rows.length, expected, cls);
  }
  const allFleet = byClass(tree, "mine-view-full-fleet");
  activate(allFleet); tree = view.render();
  assert.equal(detailView(tree).rows.length, equipment.length);
});

test("movement cards and new-intake type counts preserve all counted requests, including uncatalogued sites", () => {
  const rows = [...requests, {ref: "UNMAPPED", site: "Former workshop", status: "Open", start: "2026-09-09", category: "Breakdown"}];
  const view = harness({allowedSites: [], restrictToScope: false});
  let tree = view.render(rows);
  tree = setDashboardDate(view, "2026-09-09", rows);
  byLabel(tree, "Site-wise BD from date").props.onChange({target: {value: "2026-09-01"}}); tree = view.render(rows);
  const cards = findAll(byClass(tree, "mine-breakdown-movement-kpis"), (node) => node.props["data-dashboard-list"]);
  for (const card of cards) {
    const expected = Number(text(findAll(card, (node) => node.type === "strong")[0]));
    activate(card); tree = view.render(rows);
    assert.equal(detailView(tree).rows.length, expected, text(card));
  }
  const types = findAll(byLabel(tree, "Breakdown type percentage of BD In"), (node) => node.type === "article");
  for (const card of types) {
    const expected = Number(text(findAll(card, (node) => node.type === "small")[0]).match(/^\d+/)[0]);
    activate(card); tree = view.render(rows);
    assert.equal(detailView(tree).rows.length, expected, text(card));
  }
});

test("actual Recorded total and each daily bar open all 475 requests including six unmapped sites", () => {
  const rows = Array.from({length: 475}, (_, index) => ({ref: `REGRESSION-${index}`, site: index < 469 ? "Sasti OB" : "Retired workshop",
    start: `2026-09-${String(4 + index % 7).padStart(2, "0")} 09:00:00`, status: "Open", category: "Breakdown"}));
  const view = harness({allowedSites: [], restrictToScope: false});
  let tree = view.render(rows);
  byLabel(tree, "Breakdown trend to date").props.onChange({target: {value: "2026-09-10"}});
  tree = view.render(rows);
  byLabel(tree, "Breakdown trend from date").props.onChange({target: {value: "2026-09-04"}});
  tree = view.render(rows);
  assert.match(text(byClass(tree, "mine-trend-summary")), /Recorded475/);
  const card = findAll(byClass(tree, "mine-trend-summary"), (node) => node.props["data-dashboard-list"] === "trend:all")[0];
  const target = {};
  card.props.onKeyDown({key: "Enter", currentTarget: target, target, preventDefault() {}, stopPropagation() {}});
  tree = view.render(rows);
  assert.equal(detailView(tree).rows.length, 475);
  for (let day = 4; day <= 10; day++) {
    const date = `2026-09-${String(day).padStart(2, "0")}`;
    const expected = rows.filter((row) => row.start.startsWith(date)).length;
    const bar = byLabel(tree, `${displayDates.formatDisplayDate(date)}: ${expected} recorded breakdown requests`);
    bar.props.onKeyDown({key: "Enter", currentTarget: target, target, preventDefault() {}, stopPropagation() {}});
    tree = view.render(rows);
    assert.equal(detailView(tree).rows.length, expected);
  }
});

test("all-region drilldown still excludes records outside a restricted user's assigned site", () => {
  const view = harness();
  const rows = [...requests, {ref: "HIDDEN", site: "Majri OB", start: "2026-09-09", status: "Open"},
    {ref: "UNASSIGNED", site: "Former workshop", start: "2026-09-09", status: "Open"}];
  let tree = view.render(rows);
  byLabel(tree, "Breakdown trend from date").props.onChange({target: {value: "2026-09-01"}});
  tree = view.render(rows);
  button(byClass(tree, "mine-panel mine-breakdown-trend"), "View all").props.onClick();
  tree = view.render(rows);
  assert.deepEqual(detailView(tree).rows.map(({requestReference}) => requestReference), requests.map(({ref}) => ref));
});

test("compiled Dashboard retains older open and Idle assets in live status after selecting an opening date", () => {
  const view = harness();
  let tree = view.render();
  tree = setDashboardDate(view, "2026-09-09");
  button(tree, "Availability Count").props.onClick();
  tree = view.render();
  assert.ok(byLabel(tree, "Sasti OB: 1 on road, 1 off road and 1 idle. Open fleet details."));
  const summary = byClass(tree, "mine-site-road-summary");
  assert.equal(text(byClass(summary, "offroad")), "Off road1");
  assert.equal(text(byClass(summary, "idle")), "Idle1");
  assert.equal(text(fleetCount(tree, "Breakdown")), "1");
  assert.equal(requests[0].start, "2026-09-01 09:00:00");
});

test("compiled lifecycle places Idle on its actual India event day, not its old opening date", () => {
  const view = harness();
  let tree = view.render();
  tree = setDashboardDate(view, "2026-09-09");
  tree = setLifecycleFrom(view, "2026-09-01");
  assert.ok(byLabel(tree, "09-09-2026: 1 Idle Vehicles requests"));
  assert.ok(byLabel(tree, "09-09-2026: 1 Closed requests"));
  assert.ok(byLabel(tree, "09-09-2026: 0 Verified requests"));
  const graph = findAll(tree, node => node.props?.className === "mine-request-chart-days mine-request-grouped-readings")[0];
  const groups = findAll(graph, node => node.props?.className === "mine-request-chart-day");
  assert.ok(groups.length > 1);
  for (const group of groups) assert.equal(findAll(group, node => node.type === "button").length, 6);
  assert.equal(byLabel(tree, "Request lifecycle custom days").props.value, undefined);
  const withoutIdleTime = requests.map((row) => row.ref === "OLD-IDLE" ? {...row, idealRequestedAt: ""} : row);
  tree = view.render(withoutIdleTime);
  assert.ok(byLabel(tree, "09-09-2026: 0 Idle Vehicles requests"));
});

test("site-wise From/To updates inclusive movement, availability, exports and linked details together", () => {
  const view = harness();
  let tree = view.render();
  tree = setDashboardDate(view, "2026-09-09");
  byLabel(tree, "Site-wise BD from date").props.onChange({target: {value: "2026-09-01"}});
  tree = view.render();
  byLabel(tree, "Site-wise BD to date").props.onChange({target: {value: "2026-09-08"}});
  tree = view.render();
  const site = byClass(tree, "mine-breakdown-site-row");
  assert.match(site.props["aria-label"], /0 open, 2 in, 0 out, 2 balance/);
  assert.match(site.props["aria-label"], /1 on road, 2 off road and 0 idle/);
  assert.ok(!text(byLabel(tree, "Site-wise BD date range")).includes("Availability as of"), "redundant filter note is removed; table caption retains the date");
  assert.equal(text(byLabel(tree, "Site-wise BD table period")), "From: 01-09-2026To: 08-09-2026Availability as of 08-09-2026");
  const exported = findAll(tree, (node) => node.props.title === "Fleet control dashboard KPI report")[0].props.rows;
  const incoming = exported.find((row) => row.section === "Breakdown movement" && row.metric === "BD In");
  assert.equal(incoming.value, 2);
  assert.equal(incoming.scope, displayDates.formatDisplayDateRange("2026-09-01", "2026-09-08"));
  assert.match(exported.find((row) => row.section === "Site summary").details, /Off road 2; Idle 0/);
  site.props.onClick();
  tree = view.render();
  assert.equal(byLabel(tree, "Breakdown movement from date").props.value, "2026-09-01");
  assert.equal(byLabel(tree, "Breakdown movement to date").props.value, "2026-09-08");
  button(tree, "Availability Count").props.onClick();
  tree = view.render();
  assert.ok(byLabel(tree, "Sasti OB: 1 on road, 2 off road and 0 idle. Open fleet details."));
  assert.equal(text(byLabel(tree, "Availability table period")), "From: 01-09-2026To: 08-09-2026Availability as of 08-09-2026");
  // The independent top-level date and live fleet chart are not changed.
  assert.equal(byLabel(tree, "Dashboard to date").props.value, "2026-09-09");
  assert.equal(text(fleetCount(tree, "Breakdown")), "1");
});

test("site-wise range allows one day, keeps dates ordered, rejects future dates and resets", () => {
  const view = harness();
  let tree = view.render();
  tree = setDashboardDate(view, "2026-09-09");
  byLabel(tree, "Site-wise BD from date").props.onChange({target: {value: "2026-09-09"}});
  tree = view.render();
  assert.match(byClass(tree, "mine-breakdown-site-row").props["aria-label"], /2 open, 1 in, 1 out, 2 balance/);
  byLabel(tree, "Site-wise BD to date").props.onChange({target: {value: "2026-09-01"}});
  tree = view.render();
  assert.equal(byLabel(tree, "Site-wise BD from date").props.value, "2026-09-01");
  assert.equal(byLabel(tree, "Site-wise BD to date").props.value, "2026-09-01");
  assert.match(byClass(tree, "mine-breakdown-site-row").props["aria-label"], /0 open, 2 in, 0 out, 2 balance/);
  byLabel(tree, "Site-wise BD from date").props.onChange({target: {value: "2026-09-09"}});
  tree = view.render();
  assert.equal(byLabel(tree, "Site-wise BD to date").props.value, "2026-09-09");
  byLabel(tree, "Site-wise BD to date").props.onChange({target: {value: "9999-12-31"}});
  tree = view.render();
  assert.equal(byLabel(tree, "Site-wise BD to date").props.value, "2026-09-09");
  button(tree, "Reset dates").props.onClick();
  tree = view.render();
  assert.equal(byLabel(tree, "Site-wise BD from date").props.value, todayKey);
  assert.equal(byLabel(tree, "Site-wise BD to date").props.value, todayKey);
  assert.equal(button(tree, "Reset dates").props.disabled, true);
  byLabel(tree, "Site-wise BD from date").props.onChange({target: {value: "2026-09-01"}});
  tree = view.render();
  byLabel(tree, "Site-wise BD to date").props.onChange({target: {value: ""}});
  tree = view.render();
  assert.equal(byLabel(tree, "Site-wise BD from date").props.value, "");
});

test("throughput defaults to today, clearing either date shows all time and Reset restores today", () => {
  const rows = [...requests, {ref: "OLD-CLOSED", site: "Sasti OB", start: "2024-01-01", closedAt: "2024-02-01", category: "WGM", status: "Closed"}];
  const view = harness();
  let tree = view.render(rows);
  const assertToday = () => {
    assert.equal(byLabel(tree, "Site-wise BD from date").props.value, todayKey);
    assert.equal(byLabel(tree, "Site-wise BD to date").props.value, todayKey);
    assert.equal(text(byLabel(tree, "Site-wise BD table period")), todayCaption);
    assert.equal(button(tree, "Reset dates").props.disabled, true);
    assert.match(byClass(tree, "mine-breakdown-site-row").props["aria-label"], /2 open, 0 in, 0 out, 2 balance/);
    const exported = findAll(tree, node => node.props.title === "Fleet control dashboard KPI report")[0].props.rows;
    assert.equal(exported.find(row => row.section === "Breakdown movement" && row.metric === "BD In").scope, displayDates.formatDisplayDateRange(todayKey, todayKey));
  };
  const assertAllTime = () => {
    assert.equal(byLabel(tree, "Site-wise BD from date").props.value, "");
    assert.equal(byLabel(tree, "Site-wise BD to date").props.value, "");
    assert.equal(text(byLabel(tree, "Site-wise BD table period")), liveAvailabilityCaption);
    assert.equal(button(tree, "Reset dates").props.disabled, false);
    assert.match(byClass(tree, "mine-breakdown-site-row").props["aria-label"], /0 open, 4 in, 2 out, 2 balance/);
    const cards = findAll(byClass(tree, "mine-breakdown-movement-kpis"), node => node.props["data-dashboard-list"]);
    assert.deepEqual(cards.map(card => Number(text(findAll(card, node => node.type === "strong")[0]))), [4, 2, 1, 1]);
    for (const card of cards) {
      activate(card); tree = view.render(rows);
      assert.equal(detailView(tree).rows.length, Number(text(findAll(card, node => node.type === "strong")[0])));
      assert.match(byClass(tree, "dashboard-asset-modal").props.title, /All time/);
    }
    const types = findAll(byLabel(tree, "Breakdown type percentage of open BD balance"), node => node.type === "article");
    assert.ok(types.some(card => text(card).includes("WGM0%0 requests")));
    assert.ok(types.some(card => text(card).includes("Breakdown100%1 request")));
    const exported = findAll(tree, node => node.props.title === "Fleet control dashboard KPI report")[0].props.rows;
    assert.equal(exported.find(row => row.section === "Breakdown movement" && row.metric === "BD In").scope, "All time");
  };
  assertToday();
  // A different chart's date must not reinstate a hidden filter when this one clears.
  tree = setDashboardDate(view, "2026-08-01", rows);
  for (const clear of ["from", "to"]) {
    byLabel(tree, "Site-wise BD to date").props.onChange({target: {value: "2026-09-09"}});
    tree = view.render(rows);
    assert.equal(byLabel(tree, "Site-wise BD from date").props.value, "2026-09-09");
    assert.match(byClass(tree, "mine-breakdown-site-row").props["aria-label"], /2 open, 1 in, 1 out, 2 balance/);
    byLabel(tree, `Site-wise BD ${clear} date`).props.onChange({target: {value: ""}});
    tree = view.render(rows);
    assertAllTime();
    button(tree, "Availability Count").props.onClick(); tree = view.render(rows);
    assert.equal(text(byLabel(tree, "Availability table period")), liveAvailabilityCaption);
    assert.ok(byLabel(tree, "Sasti OB: 1 on road, 1 off road and 1 idle. Open fleet details."));
    button(tree, "Site-wise BD Movement").props.onClick(); tree = view.render(rows);
    button(tree, "Reset dates").props.onClick(); tree = view.render(rows);
    assertToday();
  }
  byLabel(tree, "Site-wise BD from date").props.onChange({target: {value: ""}}); tree = view.render(rows);
  assertAllTime();
  byClass(tree, "mine-breakdown-site-row").props.onClick(); tree = view.render(rows);
  assert.equal(byLabel(tree, "Breakdown movement from date").props.value, "2024-01-01");
});

test("throughput region and dependent site filters scope cards, types, tables, exports and linked lists", () => {
  const equipment = [...assets,
    {id: 4, door: "M1", currentLocation: "Majri OB", category: "Vehicle"},
    {id: 5, door: "N1", currentLocation: "Jayant OB", category: "Vehicle"},
  ];
  const rows = [...requests,
    {ref: "MAJRI", door: "M1", site: "Majri OB", start: "2026-09-09", status: "Open", category: "WGM"},
    {ref: "JAYANT", door: "N1", site: "Jayant OB", start: "2026-09-09", status: "Closed", closedAt: "2026-09-09", category: "Accidental"},
  ];
  const regions = [{code: "WCL", sites: ["Sasti OB", "Majri OB"]}, {code: "NCL", sites: ["Jayant OB"]}];
  const view = harness({equipment, regions, allowedSites: [], restrictToScope: false});
  let tree = view.render(rows);
  assert.equal(byLabel(tree, "Vehicle throughput region").props.value, "all");
  assert.equal(byLabel(tree, "Vehicle throughput site"), undefined);
  const change = (label, value) => { byLabel(tree, label).props.onChange({target: {value}}); tree = view.render(rows); };
  change("Vehicle throughput region", "WCL");
  assert.deepEqual(findAll(byLabel(tree, "Vehicle throughput site"), node => node.type === "option").map(node => node.props.value), ["all", "Sasti OB", "Majri OB"]);
  for (const site of ["all", "Majri OB", "Sasti OB"]) {
    change("Vehicle throughput site", site);
    const selectedRows = rows.filter(row => site === "all" ? row.site !== "Jayant OB" : row.site === site);
    const selectedAssets = equipment.filter(row => site === "all" ? row.currentLocation !== "Jayant OB" : row.currentLocation === site);
    for (const day of ["", "2026-09-09"]) {
      change("Site-wise BD from date", day);
      const totals = movement.breakdownMovementForRange(selectedRows, day, day);
      const cards = findAll(byClass(tree, "mine-breakdown-movement-kpis"), node => node.props["data-dashboard-list"]);
      const idle = selectedRows.filter(row => movement.matchesBreakdownMovement(row, day, day, "idle")).length;
      assert.deepEqual(cards.map(card => Number(text(findAll(card, node => node.type === "strong")[0]))), [totals.open + totals.incoming, totals.outgoing, totals.balance - idle, idle]);
      for (const card of cards) {
        activate(card); tree = view.render(rows);
        assert.equal(detailView(tree).rows.length, Number(text(findAll(card, node => node.type === "strong")[0])));
        assert.ok(detailView(tree).rows.every(row => selectedRows.some(request => request.ref === row.requestReference)));
      }
      for (const type of findAll(byLabel(tree, "Breakdown type percentage of BD In"), node => node.type === "article")) {
        activate(type); tree = view.render(rows);
        assert.equal(detailView(tree).rows.length, Number(text(findAll(type, node => node.type === "small")[0]).match(/^\d+/)[0]));
      }
      const siteRows = findAll(tree, node => node.props.className === "mine-breakdown-site-row");
      assert.equal(siteRows.length, site === "all" ? 2 : 1);
      const exported = findAll(tree, node => node.props.title === "Fleet control dashboard KPI report")[0].props.rows;
      assert.equal(exported.find(row => row.section === "Breakdown movement").details, site === "all" ? "WCL" : site);
      button(tree, "Availability Count").props.onClick(); tree = view.render(rows);
      const snapshotRequests = availabilityRequestsForDate(selectedRows, day);
      const snapshotEquipment = day ? dashboardFleetSnapshot(selectedAssets, snapshotRequests) : selectedAssets;
      const expected = metrics.liveEquipmentMetrics(snapshotEquipment, snapshotRequests);
      const summary = byClass(tree, "mine-site-road-summary");
      for (const [cls, count] of [["availability", expected.total], ["onroad", expected.onRoad], ["offroad", expected.offRoad], ["idle", expected.idle]]) {
        const card = byClass(summary, cls);
        assert.equal(Number(text(findAll(card, node => node.type === "strong")[0])), count);
        activate(card); tree = view.render(rows);
        assert.equal(detailView(tree).rows.length, count);
      }
      assert.equal(findAll(tree, node => node.props.className?.startsWith("mine-road-site-row")).length, siteRows.length);
      button(tree, "Site-wise BD Movement").props.onClick(); tree = view.render(rows);
    }
  }
  change("Vehicle throughput region", "NCL");
  assert.equal(byLabel(tree, "Vehicle throughput site").props.value, "all");
  assert.deepEqual(findAll(byLabel(tree, "Vehicle throughput site"), node => node.type === "option").map(node => node.props.value), ["all", "Jayant OB"]);
  change("Vehicle throughput region", "all");
  assert.equal(byLabel(tree, "Vehicle throughput site"), undefined);
  assert.equal(findAll(tree, node => node.props.className === "mine-breakdown-site-row").length, 3);
  assert.equal(byLabel(tree, "Region").props.value, "all", "panel filters leave the other charts' scope unchanged");
  const restricted = harness({equipment, regions, allowedSites: ["Sasti OB"], restrictToScope: true});
  let restrictedTree = restricted.render(rows);
  assert.deepEqual(findAll(byLabel(restrictedTree, "Vehicle throughput region"), node => node.type === "option").map(node => node.props.value), ["all", "WCL"]);
  byLabel(restrictedTree, "Vehicle throughput region").props.onChange({target: {value: "WCL"}});
  restrictedTree = restricted.render(rows);
  assert.deepEqual(findAll(byLabel(restrictedTree, "Vehicle throughput site"), node => node.type === "option").map(node => node.props.value), ["all", "Sasti OB"]);
});

test("From and To stay visible above the table without a calendar trigger or popup", () => {
  const view = harness();
  let tree = view.render();
  assert.equal(byLabel(tree, "Select site-wise BD dates"), undefined);
  assert.ok(byLabel(tree, "Site-wise BD from date"));
  assert.ok(byLabel(tree, "Site-wise BD to date"));
  byLabel(tree, "Site-wise BD from date").props.onChange({target: {value: "2026-09-01"}});
  tree = view.render();
  assert.equal(byLabel(tree, "Site-wise BD from date").props.value, "2026-09-01");
  assert.equal(findAll(tree, (node) => node.props.className === "dashboard-breakdown-date-modal").length, 0);
  assert.ok(text(byLabel(tree, "Site-wise BD table period")).includes("From: 01-09-2026"));
});

test("Breakdown Trend From/To keeps bars, counts, average and View all on the same inclusive period", () => {
  const view = harness();
  const rows = [...requests, {ref: "AFTER-RANGE", door: "V1", chassis: "C1", site: "Sasti OB", status: "Open", start: "2026-09-10 09:00:00"},
    {ref: "OTHER-SITE", door: "V1", site: "Majri OB", status: "Open", start: "2026-09-01 09:00:00"}];
  let tree = view.render(rows);
  tree = setDashboardDate(view, "2026-09-09", rows);
  byLabel(tree, "Breakdown trend to date").props.onChange({target: {value: "2026-09-09"}});
  tree = view.render(rows);
  byLabel(tree, "Breakdown trend from date").props.onChange({target: {value: "2026-09-01"}});
  tree = view.render(rows);
  assert.equal(text(byLabel(tree, "Breakdown trend selected period")), "From: 01-09-2026 · To: 09-09-2026");
  assert.equal(text(byClass(tree, "mine-trend-summary")), "Recorded39 selected daysDaily baseline0.3Recorded per day");
  assert.ok(byLabel(tree, "9 day recorded breakdown chart"));
  assert.ok(byLabel(tree, "01-09-2026: 2 recorded breakdown requests"));
  assert.ok(byLabel(tree, "02-09-2026: 0 recorded breakdown requests"));
  assert.ok(byLabel(tree, "09-09-2026: 1 recorded breakdown requests"));
  button(byClass(tree, "mine-panel mine-breakdown-trend"), "View all").props.onClick();
  tree = view.render(rows);
  let details = findAll(tree, (node) => node.props.requestRecords === true && Array.isArray(node.props.rows))[0].props;
  assert.deepEqual(details.rows.map((row) => row.requestReference), ["OLD-OPEN", "OLD-IDLE", "NEW-CLOSED"]);
  assert.ok(details.title.includes(displayDates.formatDisplayDateRange("2026-09-01", "2026-09-09")));
  const day = byLabel(tree, "01-09-2026: 2 recorded breakdown requests");
  const target = {};
  day.props.onKeyDown({key: "Enter", currentTarget: target, target, preventDefault() {}, stopPropagation() {}});
  tree = view.render(rows);
  details = findAll(tree, (node) => node.props.requestRecords === true && Array.isArray(node.props.rows))[0].props;
  assert.deepEqual(details.rows.map((row) => row.requestReference), ["OLD-OPEN", "OLD-IDLE"]);
  byLabel(tree, "Breakdown trend to date").props.onChange({target: {value: "2026-09-01"}});
  tree = view.render(rows);
  assert.ok(byLabel(tree, "1 day recorded breakdown chart"));
  assert.equal(text(byClass(tree, "mine-trend-summary")), "Recorded21 selected daysDaily baseline2.0Recorded per day");
  byLabel(tree, "Breakdown trend from date").props.onChange({target: {value: "2026-08-01"}});
  tree = view.render(rows);
  byLabel(tree, "Breakdown trend to date").props.onChange({target: {value: "2026-09-09"}});
  tree = view.render(rows);
  assert.ok(byLabel(tree, "40 day recorded breakdown chart"));
  button(byLabel(tree, "Breakdown trend period"), "14D").props.onClick();
  tree = view.render(rows);
  assert.equal(byLabel(tree, "Breakdown trend from date").props.value, "2026-08-27");
  assert.equal(byLabel(tree, "Breakdown trend to date").props.value, "2026-09-09");
  assert.ok(byLabel(tree, "14 day recorded breakdown chart"));
  byLabel(tree, "Breakdown trend to date").props.onChange({target: {value: "9999-12-31"}});
  tree = view.render(rows);
  assert.equal(byLabel(tree, "Breakdown trend to date").props.value, "2026-09-09");
  assert.ok(findAll(tree, (node) => node.props.role === "alert").length);
  byLabel(tree, "Breakdown trend to date").props.onChange({target: {value: ""}});
  tree = view.render(rows);
  assert.equal(findAll(tree, (node) => node.props.role === "alert").length, 0);
  assert.equal(byLabel(tree, "Dashboard to date").props.value, "2026-09-09");
});

test("every site equipment and vehicle total opens exactly its registered assets in both chart modes", () => {
  const sites = [
    {site: "Sasti OB", equipment: 48, vehicles: 142, equipmentBd: 5, vehiclesBd: 8},
    {site: "Majri OB", equipment: 3, vehicles: 4, equipmentBd: 1, vehiclesBd: 1},
    {site: "Jayant OB", equipment: 0, vehicles: 0, equipmentBd: 0, vehiclesBd: 0},
    {site: "Hidden site", equipment: 2, vehicles: 2, equipmentBd: 0, vehiclesBd: 0},
  ];
  const equipment = sites.flatMap((site) => ["equipment", "vehicles"].flatMap((category) => Array.from({length: site[category]}, (_, index) => Object.freeze({
    id: `${site.site}-${category}-${index}`, door: `${category}-${index}`, chassisNo: `${site.site}-${category}-${index}`,
    category: category === "equipment" ? (index % 2 ? "Equipments" : " Equipment ") : (index % 2 ? "Vehicles" : " Vehicle "),
    currentLocation: site.site, status: "Operational", group: "QA",
  }))));
  const rows = sites.flatMap((site) => ["equipment", "vehicles"].flatMap((category) => Array.from({length: site[`${category}Bd`]}, (_, index) => Object.freeze({
    ref: `${site.site}-${category}-${index}`, door: `${category}-${index}`, chassis: `${site.site}-${category}-${index}`,
    site: site.site, status: "Open", category: "Breakdown", start: "2026-09-01 10:00:00",
  }))));
  const allowedSites = sites.slice(0, 3).map(({site}) => site);
  const targetFor = (category, isBreakdown) => {
    const column = {classList: {contains: (name) => name === category}};
    const bar = {closest: () => column};
    return {closest: (selector) => selector === ".mine-fleet-breakdown-segment" ? (isBreakdown ? bar : null)
      : selector === ".mine-fleet-bar" ? bar : null};
  };
  for (const mode of ["breakdown", "total"]) {
    const view = harness({equipment, allowedSites, regions: [{code: "WCL", sites: sites.map(({site}) => site)}]});
    let tree = view.render(rows);
    const modePill = () => button(byLabel(tree, "Fleet chart view"), mode === "total" ? "Total" : "Breakdown");
    modePill().props.onClick();
    tree = view.render(rows);
    assert.equal(tree.props.onBack, undefined, `clicking the ${mode} pill keeps the dashboard open`);
    assert.equal(modePill().props["aria-pressed"], true);
    if (mode === "breakdown") {
      // Only the breakdown number opens the current breakdown list.
      fleetCount(tree, "Breakdown").props.onClick();
      tree = view.render(rows);
      assert.equal(detailView(tree).rows.length, 15);
      findAll(tree, (node) => typeof node.props.onHourlyReport === "function")[0].props.onHourlyReport();
      tree = view.render(rows);
      assert.equal(typeof tree.props.onBack, "function");
      assert.equal(typeof tree.props.ActionsTable, "function");
      assert.ok(tree.props.sites.length);
      tree.props.onBack();
      tree = view.render(rows);
      assert.equal(detailView(tree).rows.length, 15);
    }
    const fleetBars = findAll(tree, node => node.props.site?.breakdown && node.props.axisMax);
    assert.ok(fleetBars.length);
    assert.ok(fleetBars.every(node => node.props.axisMax === fleetBars[0].props.axisMax && !("breakdownScaleMax" in node.props)), "all sites share one linear axis with no bent breakdown band");
    for (const site of sites.slice(0, 3)) {
      for (const category of ["equipment", "vehicles"]) {
        const clickSite = (isBreakdown) => {
          const chart = byClass(tree, "mine-fleet-chart-sites");
          const siteButton = findAll(chart, (node) => node.type === "button" && node.props["aria-label"]?.startsWith(`${site.site}:`))[0];
          siteButton.props.onClick({detail: 1, target: targetFor(category, isBreakdown)});
          tree = view.render(rows);
          return findAll(tree, (node) => node.props.initialSite === site.site && Array.isArray(node.props.rows))[0].props;
        };
        const details = clickSite(false);
        const expectedIds = equipment.filter((row) => row.currentLocation === site.site && row.id.includes(`-${category}-`)).map((row) => row.id);
        assert.deepEqual(details.rows.map((row) => row.id), expectedIds, `${mode}: ${site.site} ${category}`);
        assert.equal(details.rows.length, site[category]);
        assert.equal(detailView(tree).rows.length, site[category]);
        assert.equal(details.initialRegion, "WCL");
        assert.equal(details.requestRecords, false);
        assert.equal(details.title, `${site.site} · ${category === "vehicles" ? "Vehicle" : "Equipment"} records`);
        if (mode === "breakdown" && site[`${category}Bd`]) {
          const breakdown = clickSite(true);
          assert.equal(breakdown.rows.length, site[`${category}Bd`]);
          assert.match(breakdown.title, /BD Balance$/);
          assert.ok(breakdown.rows.every((row) => expectedIds.includes(row.id)));
        }
      }
    }
  }
});
