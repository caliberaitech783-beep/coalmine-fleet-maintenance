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

function harness({equipment = assets, regions = [{code: "WCL", sites: ["Sasti OB"]}], allowedSites = ["Sasti OB"]} = {}) {
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
    subsidiaryData: regions,
    useDashboardEquipment: () => ({records: equipment, loaded: true, loadError: "", scope: {restrictToScope: true, allowedSites, allowedRegions: ["WCL"]}}),
    firstTripTimestamp: (request) => request.firstTripAt || "",
    formatTwelveHourDateTime: displayDates.formatDisplayDateTime,
    Status: Null,
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
  assert.equal(byLabel(tree, "Site-wise BD from date").props.value, "2026-09-05");
  assert.equal(byLabel(tree, "Site-wise BD to date").props.value, "2026-09-09");
  assert.equal(button(tree, "Reset dates").props.disabled, true);
  byLabel(tree, "Site-wise BD from date").props.onChange({target: {value: "2026-09-01"}});
  tree = view.render();
  byLabel(tree, "Site-wise BD to date").props.onChange({target: {value: ""}});
  tree = view.render();
  assert.equal(byLabel(tree, "Site-wise BD from date").props.value, "2026-09-05");
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
        assert.equal(details.initialRegion, "WCL");
        assert.equal(details.requestRecords, false);
        assert.equal(details.title, `${site.site} · ${category === "vehicles" ? "Vehicle" : "Equipment"} records`);
        if (mode === "breakdown" && site[`${category}Bd`]) {
          const breakdown = clickSite(true);
          assert.equal(breakdown.rows.length, site[`${category}Bd`]);
          assert.match(breakdown.title, /Breakdown requests$/);
          assert.ok(breakdown.rows.every((row) => expectedIds.includes(row.id)));
        }
      }
    }
  }
});
