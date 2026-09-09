import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { transformWithOxc } from "vite";
import { liveEquipmentMetrics, liveEquipmentRoadStatus } from "../dashboard-equipment-metrics.mjs";
import { requestWithEquipmentMasterDetails } from "../request-equipment.mjs";
import { recordBelongsToSite } from "../site-location.mjs";
import { managerRoleSelection } from "../admin-access.mjs";
import { visibleInMisRequests, visibleInMisHistory } from "../src/mis-history.mjs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const managerSource = source.slice(source.indexOf("function ManagerDashboard("), source.indexOf("function Dashboard("));
const managerCode = (await transformWithOxc(managerSource, "ManagerDashboard.jsx", { jsx: { runtime: "classic" } })).code;
const Null = () => null;
const BreakdownTable = () => null;
const RequestDataState = () => null;
const FleetDataState = () => null;
const ManagerIdleConfirmation = () => null;
const all = (tree, predicate) => {
  const result = [];
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!React.isValidElement(node)) return;
    if (predicate(node)) result.push(node);
    visit(node.props.children);
  };
  visit(tree);
  return result;
};
const text = (node) => Array.isArray(node) ? node.map(text).join("") : React.isValidElement(node) ? text(node.props.children) : typeof node === "string" || typeof node === "number" ? String(node) : "";
const button = (tree, label) => all(tree, (node) => node.type === "button" && text(node).trim() === label)[0];
const table = (tree) => all(tree, (node) => node.type === BreakdownTable)[0];
const cards = (tree) => {
  const grid = all(tree, (node) => node.props.className === "manager-kpi-grid")[0];
  return all(grid, (node) => node.type === "button").map((node) => ({
    label: text(all(node, (child) => child.type === "span")[0]),
    value: text(all(node, (child) => child.type === "strong")[0]),
    element: node,
  }));
};

function managerHarness(equipment, equipmentState = {}) {
  const slots = [];
  let cursor = 0;
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
  };
  const scope = {
    React, useState, liveEquipmentMetrics, liveEquipmentRoadStatus, requestWithEquipmentMasterDetails,
    recordBelongsToSite, managerRoleSelection, visibleInMisRequests, visibleInMisHistory,
    equipmentGroupLabel: (row) => row.group || row.category || "Unspecified",
    useDashboardEquipment: () => ({ records: equipment, loaded: true, scope: { restrictToScope: true, allowedSites: ["Sasti OB"] }, ...equipmentState }),
    preventTableAutoScroll: () => {}, BreakdownTable, RequestDataState, FleetDataState, ManagerIdleConfirmation,
    ShieldCheck: Null,
  };
  const component = new Function(...Object.keys(scope), `${managerCode}; return ManagerDashboard;`)(...Object.values(scope));
  return { render(props = {}) { cursor = 0; return component({ requestsLoaded: true, requestsUpdatedAt: 1788854400000, ...props }); } };
}

const equipment = [
  { door: "D1", chassisNo: "CH1", category: "Vehicle", currentLocation: "Sasti OB", status: "Breakdown" },
  { door: "D2", chassisNo: "CH2", category: "Vehicle", currentLocation: "Sasti OB", status: "Idle" },
  { door: "D3", chassisNo: "CH3", category: "Equipment", currentLocation: "Sasti OB", status: "Off road" },
];
const open = { ref: "OPEN", door: "D1", chassis: "CH1", site: "Sasti OB", status: "In progress" };
const idle = { ref: "IDLE", door: "D2", chassis: "CH2", site: "Sasti OB", status: "Idle" };
const closed = { ref: "CLOSED", door: "D3", chassis: "CH3", site: "Sasti OB", status: "Closed" };
const verified = { ...closed, ref: "VERIFIED", verifiedAt: "2026-09-09 12:00:00", firstTripDone: true };

for (const role of ["Project Manager", "Production Manager"]) test(`${role}: current request source reconciles the 303-asset fixture and a subsequent closure`, () => {
  const assets = Array.from({ length: 303 }, (_, index) => ({ door: `ASSET-${index}`, category: "Vehicle", currentLocation: "Sasti OB", status: index < 64 ? "Breakdown" : "Operational" }));
  const active = Array.from({ length: 35 }, (_, index) => ({ ref: `ACTIVE-${index}`, door: `ASSET-${index + 64}`, site: "Sasti OB", status: "Open" }));
  const history = Array.from({ length: 64 }, (_, index) => ({ ref: `OLD-${index}`, door: `ASSET-${index}`, site: "Sasti OB", status: "Closed" }));
  const app = managerHarness(assets);
  const props = { managerRole: role, requests: [...active, ...history] };
  let tree = app.render(props);
  assert.deepEqual(cards(tree).map(({ value }) => value), ["303", "268", "35", "0"]);
  assert.equal(table(tree).props.rows.length, 35);
  props.requests = props.requests.map((row) => row.ref === "ACTIVE-0" ? { ...row, status: "Closed" } : row);
  tree = app.render(props);
  assert.deepEqual(cards(tree).map(({ value }) => value), ["303", "269", "34", "0"]);
  assert.equal(table(tree).props.rows.length, 34);
});

test("Maintenance Manager Remaining uses exactly the active maintenance table rows, with Idle separate", () => {
  const app = managerHarness(equipment);
  const props = { managerRole: "Maintenance Manager", requests: [open, idle, closed, { ...open, ref: "OTHER-SITE", site: "Jayant OB" }] };
  let tree = app.render(props);
  assert.deepEqual(cards(tree).map(({ label, value }) => [label, value]), [
    ["Total equipment", "3"], ["Received for maintenance", "3"], ["Remaining", "1"], ["Completed", "1"],
  ]);
  assert.deepEqual(table(tree).props.rows.map(({ ref }) => ref), ["OPEN"]);
  button(tree, "Idle approvals (1)").props.onClick();
  tree = app.render(props);
  assert.deepEqual(table(tree).props.rows.map(({ ref }) => ref), ["IDLE"]);
  button(tree, "Closed history").props.onClick();
  tree = app.render(props);
  assert.deepEqual(table(tree).props.rows.map(({ ref }) => ref), ["CLOSED"]);
});

test("MIS Manager separates pending and verified counts without moving open or Idle records into verification", () => {
  const app = managerHarness(equipment);
  const props = { managerRole: "MIS Manager", requests: [open, idle, closed, verified] };
  let tree = app.render(props);
  assert.deepEqual(cards(tree).map(({ label, value }) => [label, value]), [
    ["Awaiting verification", "1"], ["Verified requests", "1"], ["First trip completed", "1"], ["First trip pending", "0"],
  ]);
  assert.deepEqual(table(tree).props.rows.map(({ ref }) => ref), ["CLOSED"]);
  button(tree, "Closed history").props.onClick();
  tree = app.render(props);
  assert.deepEqual(table(tree).props.rows.map(({ ref }) => ref), ["VERIFIED"]);
});

for (const [label, equipmentState, requestProps] of [
  ["initial request load", {}, { requestsLoaded: false }],
  ["request refresh failure", {}, { requestsError: "Network unavailable" }],
  ["initial equipment load", { loaded: false }, {}],
  ["equipment refresh failure", { loadError: "Network unavailable" }, {}],
]) test(`manager does not display misleading counts or actionable stale rows during ${label}`, () => {
  const app = managerHarness(equipment, equipmentState);
  const tree = app.render({ managerRole: "Production Manager", requests: [open, idle, closed], ...requestProps });
  assert.deepEqual(cards(tree).map(({ value }) => value), ["—", "—", "—", "—"]);
  assert.ok(cards(tree).every(({ element }) => element.props.disabled && element.props["aria-busy"]));
  assert.equal(table(tree), undefined);
  assert.ok(button(tree, "Idle approvals (—)"));
  assert.equal(all(tree, (node) => node.type === ManagerIdleConfirmation).length, 0);
  assert.equal(all(tree, (node) => node.props.className === "manager-live-status").length, 0);
});

test("manager restores current counts and table after a request error clears", () => {
  const app = managerHarness(equipment);
  const props = { managerRole: "Production Manager", requests: [open, idle, closed] };
  assert.equal(table(app.render({ ...props, requestsError: "Offline" })), undefined);
  const tree = app.render({ ...props, requestsError: "" });
  assert.deepEqual(cards(tree).map(({ value }) => value), ["3", "1", "1", "1"]);
  assert.deepEqual(table(tree).props.rows.map(({ ref }) => ref), ["OPEN", "IDLE"]);
});

for (const role of ["Project Manager", "Production Manager", "Maintenance Manager", "MIS Manager"]) test(`${role}: loading guards preserve the authorised Idle approval and cancellation actions`, () => {
  const app = managerHarness(equipment);
  const onApproveIdeal = () => {}, onCancelIdeal = () => {};
  const props = { managerRole: role, requests: [idle], onApproveIdeal, onCancelIdeal };
  let tree = app.render(props);
  button(tree, "Idle approvals (1)").props.onClick();
  tree = app.render(props);
  assert.equal(typeof table(tree).props.onApproveIdeal, "function");
  assert.equal(typeof table(tree).props.onCancelIdeal, role === "Maintenance Manager" ? "function" : "object");
  if (role !== "Maintenance Manager") assert.equal(table(tree).props.onCancelIdeal, null);
  table(tree).props.onApproveIdeal(idle);
  tree = app.render(props);
  const confirmation = all(tree, (node) => node.type === ManagerIdleConfirmation)[0];
  assert.equal(confirmation.props.action, "approve");
  assert.equal(confirmation.props.onConfirm, onApproveIdeal);
  assert.equal(confirmation.props.request.ref, "IDLE");
});

const appStart = source.indexOf("function App(");
const mutationStart = source.indexOf("addRequest = async", appStart);
const mutationEnd = source.indexOf("  const completeLogin", mutationStart);
assert.ok(mutationStart > appStart && mutationEnd > mutationStart);
const mutationCode = `const ${source.slice(mutationStart, mutationEnd)} return { addRequest, updateRequest, addDailyRemark, deleteRequest };`;

function mutationHarness({ ok = true, status = ok ? 200 : 409, saved = { ...closed }, initial = [open], reason = "QA test", refreshError = false } = {}) {
  let rows = initial;
  const events = [];
  const calls = [];
  const win = { prompt: () => reason };
  const scope = {
    window: win, session: { token: "fixture-token" }, authToken: "fixture-token", requestLoadSequence: { current: 0 },
    setRequests: (update) => { rows = typeof update === "function" ? update(rows) : update; events.push("local-state"); },
    notifyRequestChange: (window) => { assert.equal(window, win); events.push("notify"); },
    loadRequests: async () => { events.push("reload"); if (refreshError) throw new Error("Offline"); },
    console: { warn: () => {} },
    fetch: async (url, options) => { calls.push({ url, options }); return { ok, status, json: async () => saved, text: async () => JSON.stringify(saved) }; },
  };
  const operations = new Function(...Object.keys(scope), mutationCode)(...Object.values(scope));
  return { ...operations, events, calls, rows: () => rows };
}

for (const action of ["edit", "close", "verify", "ideal-onroad", "idle-cancel", "arrival-flag", "mis-flag"]) test(`${action}: successful mutation updates the local row before notifying other tabs`, async () => {
  const saved = { ...open, status: "Closed" };
  const app = mutationHarness({ saved });
  assert.deepEqual(await app.updateRequest(open.ref, {}, action), saved);
  assert.deepEqual(app.events, ["local-state", "notify"]);
  assert.deepEqual(app.rows(), [saved]);
  assert.equal(app.calls[0].options.method, "PATCH");
  const suffix = action === "edit" ? "" : `/${action}`;
  assert.equal(app.calls[0].url, `/api/requests/${open.ref}${suffix}`);
});

test("failed request updates do not notify other tabs or replace saved local rows", async () => {
  const app = mutationHarness({ ok: false, saved: { error: "Request has already changed" } });
  await assert.rejects(app.updateRequest(open.ref, {}, "ideal-onroad"), /already changed/);
  assert.deepEqual(app.events, []);
  assert.deepEqual(app.rows(), [open]);
});

test("successful creation notifies after saving and retains the saved row if the refresh fails", async () => {
  const saved = { ...open, ref: "NEW" };
  const app = mutationHarness({ saved, refreshError: true });
  assert.deepEqual(await app.addRequest(saved), saved);
  assert.deepEqual(app.events, ["local-state", "local-state", "notify", "reload"]);
  assert.equal(app.rows().filter((row) => row.ref === saved.ref).length, 1);
});

test("failed creation removes its optimistic row without announcing a successful mutation", async () => {
  const app = mutationHarness({ ok: false, saved: { error: "Duplicate active request", duplicate: true } });
  await assert.rejects(app.addRequest({ ...open, ref: "NEW" }), /Duplicate/);
  assert.equal(app.events.includes("notify"), false);
  assert.deepEqual(app.rows(), [open]);
});

test("daily remark success notifies other tabs only after the returned row is applied", async () => {
  const saved = { ...open, dailyRemarks: [{ maintenanceUpdate: "QA test" }] };
  const app = mutationHarness({ saved });
  assert.deepEqual(await app.addDailyRemark(open.ref, {}), saved);
  assert.deepEqual(app.events, ["local-state", "notify"]);
});

test("deletion notifies only after success; a cancelled or rejected deletion never notifies", async () => {
  const successful = mutationHarness();
  await successful.deleteRequest(open.ref);
  assert.deepEqual(successful.events, ["local-state", "notify"]);
  assert.deepEqual(successful.rows(), []);
  const cancelled = mutationHarness({ reason: null });
  await cancelled.deleteRequest(open.ref);
  assert.deepEqual(cancelled.events, []);
  assert.equal(cancelled.calls.length, 0);
  const rejected = mutationHarness({ ok: false, saved: { error: "Not authorised" } });
  await assert.rejects(rejected.deleteRequest(open.ref), /Not authorised/);
  assert.deepEqual(rejected.events, []);
});

test("request refresh integration keeps session isolation, fresh data validation and existing MIS exclusions", () => {
  assert.match(source, /requestState\.token === session\?\.token && requestState\.loaded/);
  assert.match(source, /if \(!Array\.isArray\(data\)\) throw new Error\("Invalid request data received"\)/);
  assert.match(source, /loadSequence === requestLoadSequence\.current/);
  assert.match(source, /watchRequestRefresh\(loadRequests, \{ win: window, doc: document, initial: true \}\)/);
  assert.match(source, /requestsVisibleToMisWorkspace/);
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const route = server.slice(server.indexOf("app.get('/api/requests'"), server.indexOf("app.post('/api/requests'"));
  assert.match(route, /res\.set\('Cache-Control','no-store'\)/);
  assert.match(route, /requestsVisibleToSession/);
});
