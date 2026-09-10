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

function harness({equipment = assets, regions = [{code: "WCL", sites: ["Sasti OB"]}], allowedSites = ["Sasti OB"], restrictToScope = true, equipmentState = {}} = {}) {
  const slots = [];
  let cursor = 0;
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
  };
  const dependencies = {
    isDurationColumn, compareDurationValues,
    ...Object.fromEntries(componentNames.map((name) => [name, Null])),
    ...metrics, ...movement, ...actions, ...dates, ...forecast, ...model, ...displayDates,
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
  };
  const Dashboard = new Function(...Object.keys(dependencies), `${code}; return Dashboard;`)(...Object.values(dependencies));
  return {render(rows = requests, props = {}) { cursor = 0; return Dashboard({requests: rows, ...props}); }};
}

for (const resource of ["requests", "equipment"]) test(`dashboard ${resource} failure keeps cards, filters and drilldown mounted without a Live label`, () => {
  const equipmentState = {updatedAt: 1788854300000};
  const view = harness({equipmentState});
  const props = {requestsUpdatedAt: 1788854400000};
  let tree = view.render(requests, props);
  byLabel(tree, "Region").props.onChange({target: {value: "WCL"}});
  tree = view.render(requests, props);
  byClass(tree, "mine-fleet-chart-title").props.onClick();
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

// Check the actual final browser filtering, not just the Dashboard's input props.
const detailView = (tree) => {
  const props = findAll(tree, (node) => Array.isArray(node.props.rows) && Array.isArray(node.props.regions))[0].props;
  return model.drilldownView(props.rows, props.regions, {region: props.initialRegion, site: props.initialSite}, {rowsAreScoped: props.rowsAreScoped});
};

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
  byLabel(tree, "Dashboard date").props.onChange({target: {value: "2026-09-09"}});
  tree = view.render(rows);
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
      assert.ok(modal.props.title.includes(displayDates.formatDisplayDate(day.date)));
      assert.ok(modal.props.title.startsWith("Sasti OB"));
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
  byLabel(tree, "Dashboard date").props.onChange({target: {value: "2026-09-09"}});
  tree = view.render(rows);
  assert.ok(byLabel(tree, "Open in Maintenance: 0 requests"));
  assert.ok(byLabel(tree, "Open in MIS: 1 requests"));
  byLabel(tree, "Closed: 1 requests").props.onClick();
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
  byLabel(tree, "Dashboard date").props.onChange({target: {value: "2026-09-09"}}); tree = view.render(rows);
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
  assert.ok(byLabel(tree, "Idle Vehicles: 1 requests"));
  assert.ok(byLabel(tree, "Closed: 1 requests"));
  assert.ok(byLabel(tree, "Verified: 0 requests"));
  const graph = findAll(tree, node => node.props?.className === "mine-request-chart-days mine-request-six-readings")[0];
  assert.equal(findAll(graph, node => node.type === "button").length, 6);
  assert.equal(byLabel(tree, "Request lifecycle custom days").props.value, undefined);
  const withoutIdleTime = requests.map((row) => row.ref === "OLD-IDLE" ? {...row, idealRequestedAt: ""} : row);
  tree = view.render(withoutIdleTime);
  assert.ok(byLabel(tree, "Idle Vehicles: 0 requests"));
});

test("site-wise From/To updates inclusive movement, availability, exports and linked details together", () => {
  const view = harness();
  let tree = view.render();
  byLabel(tree, "Dashboard date").props.onChange({target: {value: "2026-09-09"}});
  tree = view.render();
  byLabel(tree, "Site-wise BD from date").props.onChange({target: {value: "2026-09-01"}});
  tree = view.render();
  byLabel(tree, "Site-wise BD to date").props.onChange({target: {value: "2026-09-08"}});
  tree = view.render();
  const site = byClass(tree, "mine-breakdown-site-row");
  assert.match(site.props["aria-label"], /0 open, 2 in, 0 out, 2 balance/);
  assert.match(site.props["aria-label"], /1 on road, 2 off road and 0 idle/);
  assert.ok(text(byLabel(tree, "Site-wise BD date range")).includes("Availability as of 08-09-2026"));
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
  assert.equal(byLabel(tree, "Dashboard date").props.value, "2026-09-09");
  const breakdown = findAll(tree, (node) => node.type === "button" && node.props.className === "breakdown" && node.props["aria-controls"] === "fleet-region-plot")[0];
  assert.equal(text(breakdown), "Breakdown 1");
});

test("site-wise range allows one day, keeps dates ordered, rejects future dates and resets", () => {
  const view = harness();
  let tree = view.render();
  byLabel(tree, "Dashboard date").props.onChange({target: {value: "2026-09-09"}});
  tree = view.render();
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
  assert.equal(byLabel(tree, "Site-wise BD from date").props.value, "");
  assert.equal(byLabel(tree, "Site-wise BD to date").props.value, "");
  assert.equal(button(tree, "Reset dates").props.disabled, true);
  byLabel(tree, "Site-wise BD from date").props.onChange({target: {value: "2026-09-01"}});
  tree = view.render();
  byLabel(tree, "Site-wise BD to date").props.onChange({target: {value: ""}});
  tree = view.render();
  assert.equal(byLabel(tree, "Site-wise BD from date").props.value, "");
});

test("throughput defaults to all time and clearing either date or Reset restores every metric", () => {
  const rows = [...requests, {ref: "OLD-CLOSED", site: "Sasti OB", start: "2024-01-01", closedAt: "2024-02-01", category: "WGM", status: "Closed"}];
  const view = harness();
  let tree = view.render(rows);
  const assertAllTime = () => {
    assert.equal(byLabel(tree, "Site-wise BD from date").props.value, "");
    assert.equal(byLabel(tree, "Site-wise BD to date").props.value, "");
    assert.equal(text(byLabel(tree, "Site-wise BD table period")), "All timeAvailability: live");
    assert.equal(button(tree, "Reset dates").props.disabled, true);
    assert.match(byClass(tree, "mine-breakdown-site-row").props["aria-label"], /0 open, 4 in, 2 out, 2 balance/);
    const cards = findAll(byClass(tree, "mine-breakdown-movement-kpis"), node => node.props["data-dashboard-list"]);
    assert.deepEqual(cards.map(card => Number(text(findAll(card, node => node.type === "strong")[0]))), [4, 2, 2]);
    for (const card of cards) {
      activate(card); tree = view.render(rows);
      assert.equal(detailView(tree).rows.length, Number(text(findAll(card, node => node.type === "strong")[0])));
      assert.match(byClass(tree, "dashboard-asset-modal").props.title, /All time/);
    }
    const types = findAll(byLabel(tree, "Breakdown type percentage of BD In"), node => node.type === "article");
    assert.ok(types.some(card => text(card).includes("WGM25%1 request")));
    const exported = findAll(tree, node => node.props.title === "Fleet control dashboard KPI report")[0].props.rows;
    assert.equal(exported.find(row => row.section === "Breakdown movement" && row.metric === "BD In").scope, "All time");
  };
  assertAllTime();
  // A different chart's date must not reinstate a hidden filter when this one clears.
  byLabel(tree, "Dashboard date").props.onChange({target: {value: "2026-08-01"}});
  tree = view.render(rows);
  for (const clear of ["from", "to", "reset"]) {
    byLabel(tree, "Site-wise BD to date").props.onChange({target: {value: "2026-09-09"}});
    tree = view.render(rows);
    assert.equal(byLabel(tree, "Site-wise BD from date").props.value, "2026-09-09");
    assert.match(byClass(tree, "mine-breakdown-site-row").props["aria-label"], /2 open, 1 in, 1 out, 2 balance/);
    if (clear === "reset") button(tree, "Reset dates").props.onClick();
    else byLabel(tree, `Site-wise BD ${clear} date`).props.onChange({target: {value: ""}});
    tree = view.render(rows);
    assertAllTime();
    button(tree, "Availability Count").props.onClick(); tree = view.render(rows);
    assert.equal(text(byLabel(tree, "Availability table period")), "All timeAvailability: live");
    assert.ok(byLabel(tree, "Sasti OB: 1 on road, 1 off road and 1 idle. Open fleet details."));
    button(tree, "Site-wise BD Movement").props.onClick(); tree = view.render(rows);
  }
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
      assert.deepEqual(cards.map(card => Number(text(findAll(card, node => node.type === "strong")[0]))), [totals.open + totals.incoming, totals.outgoing, totals.balance]);
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
  byLabel(tree, "Dashboard date").props.onChange({target: {value: "2026-09-09"}});
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
  assert.equal(byLabel(tree, "Dashboard date").props.value, "2026-09-09");
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
    findAll(tree, (node) => node.type === "button" && node.props.className === mode && node.props["aria-controls"] === "fleet-region-plot")[0].props.onClick();
    tree = view.render(rows);
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
