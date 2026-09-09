import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { transformWithOxc } from "vite";
import { visibleInProductionHistory } from "../src/production-history.mjs";
import { visibleInMaintenanceHistory } from "../src/maintenance-history.mjs";
import { visibleInMisRequests, visibleInMisHistory } from "../src/mis-history.mjs";
import { liveEquipmentMetrics, liveEquipmentRoadStatus } from "../dashboard-equipment-metrics.mjs";
import { recordBelongsToSite, recordsForSite } from "../site-location.mjs";
import { requestWithEquipmentMasterDetails } from "../request-equipment.mjs";
import { managerRoleSelection } from "../admin-access.mjs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const codes = {};
for (const [name, next] of [["Normal", "App"], ["ManagerDashboard", "Dashboard"], ["ManagerIdleConfirmation", "ManagerDashboard"], ["RequestEditForm", "CloseRequestForm"], ["CloseRequestForm", "VerifyRequestForm"], ["VerifyRequestForm", "TicketCreateForm"]]) {
  const text = source.slice(source.indexOf(`function ${name}(`), source.indexOf(`function ${next}(`));
  codes[name] = (await transformWithOxc(text, `${name}.jsx`, {jsx: {runtime: "classic"}})).code;
}
const Null = () => null;
const BreakdownTable = () => null, MobileWorkflowTable = () => null, DailyRemarkForm = () => null;
const ManagerIdleConfirmation = () => null;
const all = (tree, predicate) => {
  const result = [];
  const visit = node => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!React.isValidElement(node)) return;
    if (predicate(node)) result.push(node);
    visit(node.props.children);
  };
  visit(tree);
  return result;
};
const text = node => Array.isArray(node) ? node.map(text).join("") : React.isValidElement(node) ? text(node.props.children) : typeof node === "string" || typeof node === "number" ? String(node) : "";
const button = (tree, label) => all(tree, node => node.type === "button" && text(node).trim() === label)[0];
const field = (tree, name) => all(tree, node => node.props.name === name)[0];
const form = tree => all(tree, node => node.type === "form")[0];
const table = tree => all(tree, node => [BreakdownTable, MobileWorkflowTable].includes(node.type))[0];
const equipment = [
  {door: "V1", chassisNo: "C1", category: "Vehicle", group: "TIPPER", status: "Operational", currentLocation: "Sasti OB"},
  {door: "V2", chassisNo: "C2", category: "Vehicle", group: "TIPPER", status: "Operational", currentLocation: "Sasti OB"},
  {door: "V3", chassisNo: "C3", category: "Vehicle", group: "TIPPER", status: "Operational", currentLocation: "Sasti OB"},
];
function harness(name, extra = {}) {
  const slots = [];
  let cursor = 0;
  const useState = initial => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
    return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
  };
  const scope = {
    React, useState, useRef: value => useState(() => ({current: value}))[0], useEffect: () => {}, useMemo: fn => fn(),
    window: {matchMedia: () => ({matches: false})}, vehicles: [], useMasterRecords: () => [equipment, null, true],
    useDashboardEquipment: () => ({records: equipment, loaded: true, scope: {restrictToScope: true, allowedSites: ["Sasti OB"]}}),
    visibleInProductionHistory, visibleInMaintenanceHistory, visibleInMisRequests, visibleInMisHistory,
    recordBelongsToSite, recordsForSite, liveEquipmentMetrics, liveEquipmentRoadStatus, managerRoleSelection,
    requestWithEquipmentMasterDetails: row => row, equipmentGroupLabel: row => row.group,
    BreakdownTable, MobileWorkflowTable, DailyRemarkForm, ManagerIdleConfirmation, RequestEditForm: Null, CloseRequestForm: Null, VerifyRequestForm: Null,
    RequestRedFlagForm: Null, MaintenanceForm: Null, preventTableAutoScroll: () => {},
    arrivalRedFlagRequired: () => false, MIS_VERIFICATION_MENU: "MIS verification", PRODUCTION_REQUEST_COLUMNS: [],
    Modal: Null, MeterFileCell: Null, EnhancedSpeechComplaint: Null, VerificationTimeField: Null,
    requestStartParts: () => ({date: "2026-09-08", time: "14:00:00"}), requestMeterTypeForRequest: () => "HMR",
    indiaDateTimeInputValue: () => "2026-09-08T14:00:00", formatTwelveHourDateTime: value => value || "—",
    normalizeEquipmentGroup: value => value, TIME_24H_PATTERN: ".*", delayedReasonRequired: () => false,
    readMeterEvidence: async file => file.evidence, alert: () => {}, URL: {createObjectURL: () => "fixture:trip-card", revokeObjectURL() {}},
    FileReader: class { readAsDataURL() { this.result = "data:image/png;base64,dGVzdA=="; this.onload(); } },
    FormData: class { constructor(values) { this.values = values; } get(key) { return this.values[key] ?? ""; } },
    ...Object.fromEntries(["Wrench", "Plus", "ShieldCheck", "CheckCircle2", "X", "ChevronRight", "Flag"].map(name => [name, Null])),
    ...extra,
  };
  const component = new Function(...Object.keys(scope), `${codes[name]}; return ${name};`)(...Object.values(scope));
  return {render(props) { cursor = 0; return component(props); }};
}

const opened = {ref: "REQ-ROLE-CYCLE", owner: "Stupal Moon", requesterLogin: "stupal", door: "V1", chassis: "C1", status: "Open", site: "Sasti OB"};
const accepted = {...opened, status: "In progress", acceptedBy: "Sanskar Manohare", acceptedAt: "2026-09-08 10:10:00"};
const idle = {...accepted, status: "Idle", idealRequestedBy: "Sanskar Manohare", idleReason: "No work"};
const closed = {...idle, status: "Closed", closedBy: "maimaintenance manager", idealApprovedBy: "maimaintenance manager", closedAt: "2026-09-08 12:00:00"};
const verified = {...closed, verifiedAt: "2026-09-08 13:00:00", verifiedBy: "Damini Rai"};
const normalProps = (role, row) => ({embedded: true, session: {assignedRole: role, location: "Sasti OB", permissions: {editRequests: role === "Maintenance User", closeRequests: role === "Maintenance User", verifyRequests: role === "MIS User"}}, requests: [row]});

test('Accepted status is enabled only in Maintenance Requests and close eligibility still requires acceptance', () => {
  const app = harness('Normal');
  const pending = {...opened, ref: 'REQ-PENDING', acceptanceRequired: true};
  const received = {...accepted, ref: 'REQ-ACCEPTED', acceptanceRequired: true};
  const props = {...normalProps('Maintenance User', received), requests: [pending, received, idle]};
  let tree = app.render(props);
  assert.equal(table(tree).props.showAcceptanceStatus, true);
  assert.deepEqual(table(tree).props.rows.map(row => row.ref), [pending.ref, received.ref, idle.ref]);
  button(tree, 'Close request form').props.onClick();
  tree = app.render(props);
  assert.equal(table(tree).props.showAcceptanceStatus, undefined);
  assert.deepEqual(table(tree).props.rows.map(row => row.ref), [received.ref]);
  for (const role of ['Production User', 'MIS User']) {
    const other = harness('Normal').render(normalProps(role, received));
    assert.notEqual(table(other).props.showAcceptanceStatus, true);
  }
});

for (const role of ["Production User", "Maintenance User", "MIS User"]) test(`${role}: mounted request/history rows use refreshed master make and model`, () => {
  let masterRecords = [];
  const app = harness("Normal", {requestWithEquipmentMasterDetails, useMasterRecords: () => [masterRecords, null, true]});
  const props = normalProps(role, verified);
  let tree = app.render(props);
  button(tree, "Closed history").props.onClick();
  tree = app.render(props);
  assert.notEqual(table(tree).props.rows[0].make, "QA MAKE");
  masterRecords = [{...equipment[0], make: "QA MAKE", model: "QA MODEL"}];
  tree = app.render(props);
  assert.equal(table(tree).props.rows[0].make, "QA MAKE");
  assert.equal(table(tree).props.rows[0].model, "QA MODEL");
});

for (const role of ["Production User", "Maintenance User"]) test(`${role}: opening and reopening Create request refreshes both masters without a page reload`, () => {
  const refreshed = [];
  const MaintenanceForm = () => null;
  const masters = {"Equipment master": [], "Repair type master": []};
  const app = harness("Normal", {MaintenanceForm, useMasterRecords: name => [masters[name], null, true, null, null, null, "", () => {
    refreshed.push(name);
    masters[name] = name === "Equipment master" ? equipment : [{repairType: "Breakdown"}];
  }]});
  const props = normalProps(role, opened);
  let tree = app.render(props);
  for (let attempt = 0; attempt < 2; attempt++) {
    button(tree, "Create request").props.onClick();
    tree = app.render(props);
    const modal = all(tree, node => node.type === MaintenanceForm)[0];
    assert.deepEqual(modal.props.equipmentRecords, equipment);
    assert.deepEqual(modal.props.repairTypeRecords, [{repairType: "Breakdown"}]);
    assert.equal(modal.props.assignedLocation, "Sasti OB");
    modal.props.close();
    tree = app.render(props);
    assert.equal(all(tree, node => node.type === MaintenanceForm).length, 0);
  }
  assert.deepEqual(refreshed, ["Equipment master", "Repair type master", "Equipment master", "Repair type master"]);
});

for (const role of ["Production User", "Maintenance User", "MIS User"]) test(`${role}: actual workspace tabs retain the full idle approval and MIS cycle`, () => {
  const app = harness("Normal");
  let props = normalProps(role, opened);
  let tree = app.render(props);
  assert.deepEqual(table(tree).props.rows.map(row => row.ref), role === "MIS User" ? [] : [opened.ref]);
  props = normalProps(role, idle);
  tree = app.render(props);
  button(tree, "Idle Vehicles").props.onClick();
  assert.deepEqual(table(app.render(props)).props.rows, [idle]);
  props = normalProps(role, closed);
  tree = app.render(props);
  assert.deepEqual(table(tree).props.rows, []);
  button(tree, role === "MIS User" ? "MIS verification" : "Closed history").props.onClick();
  tree = app.render(props);
  assert.deepEqual(table(tree).props.rows, [closed]);
  props = normalProps(role, verified);
  tree = app.render(props);
  if (role === "MIS User") {
    assert.deepEqual(table(tree).props.rows, []);
    button(tree, "Closed history").props.onClick();
    tree = app.render(props);
  }
  assert.deepEqual(table(tree).props.rows, [verified]);
});

for (const role of ["Project Manager", "Production Manager", "Maintenance Manager", "MIS Manager"]) test(`${role}: Idle actions are scoped, cancel matches server authority, and fleet counts agree`, () => {
  const app = harness("ManagerDashboard");
  const onApproveIdeal = () => {}, onCancelIdeal = () => {};
  const props = {managerRole: role, requests: [idle, {...accepted, ref: "REQ-OFF", door: "V2", chassis: "C2"}, {...idle, ref: "REQ-OTHER-SITE", site: "Jayant OB"}], onApproveIdeal, onCancelIdeal};
  let tree = app.render(props);
  if (["Project Manager", "Production Manager"].includes(role)) {
    const kpis = all(tree, node => node.props.className === "manager-kpi-grid")[0];
    const values = all(kpis, node => node.type === "strong").map(node => text(node));
    assert.deepEqual(values, ["3", "1", "1", "1"]);
  }
  button(tree, "Idle approvals (1)").props.onClick();
  tree = app.render(props);
  assert.deepEqual(table(tree).props.rows, [idle]);
  for (const [callback, action, confirm] of [["onApproveIdeal", "approve", onApproveIdeal], ["onCancelIdeal", "cancel", onCancelIdeal]]) {
    if (action === "cancel" && role !== "Maintenance Manager") {
      assert.equal(table(tree).props[callback], null, "non-maintenance managers must not receive a cancel action");
      continue;
    }
    table(tree).props[callback](idle);
    tree = app.render(props);
    const dialog = all(tree, node => node.type === ManagerIdleConfirmation)[0];
    assert.equal(dialog.props.request, idle);
    assert.equal(dialog.props.action, action);
    assert.equal(dialog.props.onConfirm, confirm);
    dialog.props.close();
    tree = app.render(props);
    assert.equal(all(tree, node => node.type === ManagerIdleConfirmation).length, 0);
  }
  button(tree, "Closed history").props.onClick();
  tree = app.render({...props, requests: [verified]});
  assert.deepEqual(table(tree).props.rows, [verified]);
  assert.equal(table(tree).props.onCancelIdeal, null);
});

test("Cancel idle honors assigned multi-role membership and cannot be enabled by an unassigned active role", () => {
  for (const [managerRoles, allowed] of [
    [["Production Manager", "Maintenance Manager"], true],
    [["Project Manager", "MIS Manager"], false],
    [["Maintenance Manager"], true],
  ]) {
    const app = harness("ManagerDashboard");
    const props = {managerRole: "Maintenance Manager", managerRoles, requests: [idle], onApproveIdeal() {}, onCancelIdeal() {}};
    let tree = app.render(props);
    button(tree, "Idle approvals (1)").props.onClick();
    tree = app.render(props);
    assert.equal(typeof table(tree).props.onApproveIdeal, "function");
    assert.equal(typeof table(tree).props.onCancelIdeal === "function", allowed);
    if (managerRoles.length > 1) {
      button(tree, managerRoles[1]).props.onClick(); tree = app.render(props);
      button(tree, "Idle approvals (1)").props.onClick(); tree = app.render(props);
      assert.equal(typeof table(tree).props.onCancelIdeal === "function", allowed);
    }
  }
});

for (const action of ["approve", "cancel"]) test(`manager ${action}: explicit confirmation preserves identity, cancel makes no API call, pending save is guarded`, async () => {
  let resolveSave, calls = 0, dismissals = 0;
  const app = harness("ManagerIdleConfirmation");
  const props = {request: idle, action, close() {dismissals++;}, onConfirm(row) {
    assert.equal(row, idle); calls++; return new Promise(resolve => {resolveSave = resolve;});
  }};
  let tree = app.render(props);
  assert.match(text(tree), new RegExp(idle.ref));
  assert.match(text(tree), /V1/);
  assert.match(text(tree), /Sasti OB/);
  assert.match(text(tree), action === "approve" ? /close the request.*MIS verification/ : /active maintenance.*not be closed/);
  button(tree, "Cancel").props.onClick();
  assert.equal(dismissals, 1);
  assert.equal(calls, 0);
  const submit = form(tree).props.onSubmit;
  const pending = submit({preventDefault() {}});
  await submit({preventDefault() {}});
  tree = app.render(props);
  tree.props.close();
  button(tree, "Cancel").props.onClick();
  assert.equal(dismissals, 1);
  assert.equal(calls, 1);
  assert.equal(button(tree, "Cancel").props.disabled, true);
  assert.equal(button(tree, "Saving…").props.disabled, true);
  resolveSave(); await pending;
  assert.equal(dismissals, 2);
});

for (const action of ["approve", "cancel"]) test(`manager ${action}: failed confirmation remains open with an inline error and can be retried`, async () => {
  let calls = 0, dismissals = 0;
  const app = harness("ManagerIdleConfirmation");
  const props = {request: idle, action, close() {dismissals++;}, async onConfirm() {
    if (++calls === 1) throw new Error("This request is no longer Idle.");
  }};
  let tree = app.render(props);
  await form(tree).props.onSubmit({preventDefault() {}});
  tree = app.render(props);
  assert.equal(dismissals, 0);
  assert.equal(button(tree, "Cancel").props.disabled, false);
  assert.equal(text(all(tree, node => node.props.role === "alert")[0]), "This request is no longer Idle.");
  await form(tree).props.onSubmit({preventDefault() {}});
  assert.equal(calls, 2);
  assert.equal(dismissals, 1);
});

for (const role of ["Production User", "Maintenance User"]) test(`${role}: successful creation from Closed history selects Requests and announces the saved reference nonblockingly`, async () => {
  let resolveSave;
  const MaintenanceForm = () => null;
  const saved = {...opened, ref: "REQ-SERVER-SAVED"};
  const app = harness("Normal", {MaintenanceForm, useMasterRecords: () => [equipment, null, true, null, null, null, "", () => {}]});
  const props = {...normalProps(role, verified), onCreate: () => new Promise(resolve => {resolveSave = resolve;})};
  let tree = app.render(props);
  button(tree, "Closed history").props.onClick();
  tree = app.render(props);
  button(tree, "Create request").props.onClick();
  tree = app.render(props);
  const dialog = all(tree, node => node.type === MaintenanceForm)[0];
  const pending = dialog.props.onSubmit({...opened, ref: "REQ-CLIENT-PENDING"});
  tree = app.render(props);
  assert.deepEqual(table(tree).props.rows, [verified]);
  assert.equal(all(tree, node => node.props.role === "status").length, 0);
  resolveSave(saved); await pending;
  dialog.props.close();
  tree = app.render({...props, requests: [saved, verified]});
  assert.deepEqual(table(tree).props.rows, [saved]);
  assert.equal(button(tree, "Requests").props.className, "active");
  const notice = all(tree, node => node.props.role === "status")[0];
  assert.match(text(notice), /REQ-SERVER-SAVED.*saved successfully/);
  assert.equal(all(tree, node => node.type === MaintenanceForm).length, 0);
  all(notice, node => node.props["aria-label"] === "Dismiss request confirmation")[0].props.onClick();
  assert.equal(all(app.render({...props, requests: [saved, verified]}), node => node.props.role === "status").length, 0);
});

test("failed creation does not announce success or leave Closed history", async () => {
  const MaintenanceForm = () => null;
  const app = harness("Normal", {MaintenanceForm, useMasterRecords: () => [equipment, null, true, null, null, null, "", () => {}]});
  const props = {...normalProps("Production User", verified), onCreate: async () => {throw new Error("Request could not be saved.");}};
  let tree = app.render(props);
  button(tree, "Closed history").props.onClick(); tree = app.render(props);
  button(tree, "Create request").props.onClick(); tree = app.render(props);
  await assert.rejects(all(tree, node => node.type === MaintenanceForm)[0].props.onSubmit(opened), /could not be saved/);
  tree = app.render(props);
  assert.equal(button(tree, "Closed history").props.className, "active");
  assert.deepEqual(table(tree).props.rows, [verified]);
  assert.equal(all(tree, node => node.type === MaintenanceForm).length, 1);
  assert.equal(all(tree, node => node.props.role === "status").length, 0);
});

test("admin embedded maintenance has a working daily-update callback", () => {
  const matches = [...source.matchAll(/<Normal\s[\s\S]*?\/>/g)].map(match => match[0]);
  assert.equal(matches.length, 2);
  for (const element of matches) assert.match(element, /onAddDailyRemark=\{addDailyRemark\}/);
  const saved = [];
  const app = harness("Normal");
  const props = {...normalProps("Maintenance User", accepted), onAddDailyRemark: (ref, payload) => saved.push({ref, payload})};
  let tree = app.render(props);
  table(tree).props.onRemark(accepted);
  tree = app.render(props);
  const dialog = all(tree, node => node.type === DailyRemarkForm)[0];
  return dialog.props.onSave({remark: "Engine inspected", delayReason: "Awaiting part"}).then(() => {
    assert.deepEqual(saved, [{ref: accepted.ref, payload: {remark: "Engine inspected", delayReason: "Awaiting part"}}]);
  });
});

test("already accepted vehicles say Save changes, not Accept vehicle again", () => {
  for (const acceptedAt of ["", "2026-09-08 10:10:00"]) {
    const tree = harness("RequestEditForm").render({request: {...accepted, acceptanceRequired: true, acceptedAt}, close() {}, onSave() {}});
    assert.ok(button(tree, acceptedAt ? "Save changes" : "Accept vehicle"));
  }
});

test("saving an existing Awaiting parts request preserves its status", async () => {
  const saved = [];
  const tree = harness("CloseRequestForm").render({request: {...accepted, status: "Awaiting parts"}, close() {}, onSave: payload => saved.push(payload)});
  assert.equal(field(tree, "status").props.value, "Awaiting parts");
  assert.ok(all(field(tree, "status"), node => node.type === "option" && node.props.value === "Awaiting parts").length);
  await form(tree).props.onSubmit({preventDefault() {}, currentTarget: {maintenanceWork: "Waiting for parts", closingDate: "2026-09-08", closingTime: "14:00:00"}});
  assert.equal(saved[0].status, "Awaiting parts");
});

for (const name of ["RequestEditForm", "CloseRequestForm", "VerifyRequestForm"]) test(`${name}: duplicate clicks and dialog dismissal cannot interrupt a pending save`, async () => {
  let finish, calls = 0, dismissals = 0;
  const app = harness(name);
  const props = {request: accepted, close() { dismissals++; }, onSave() { calls++; return new Promise(resolve => {finish = resolve;}); }};
  let tree = app.render(props);
  if (name === "VerifyRequestForm") {
    field(tree, "firstTripCardImage").props.onChange({target: {files: [{type: "image/png", size: 4}]}});
    tree = app.render(props);
  }
  const submit = form(tree).props.onSubmit;
  const event = {preventDefault() {}, currentTarget: {maintenanceWork: "Repair completed", category: "Breakdown", complaint: "Engine", closingDate: "2026-09-08", closingTime: "14:00:00", closingMeterReading: "0"}};
  const pending = submit(event);
  await submit(event);
  await Promise.resolve();
  assert.equal(calls, 1);
  tree = app.render(props);
  tree.props.close();
  button(tree, "Cancel").props.onClick();
  assert.equal(dismissals, 0);
  assert.equal(button(tree, "Cancel").props.disabled, true);
  finish();
  await pending;
  tree = app.render(props);
  tree.props.close();
  assert.equal(dismissals, 1);
});
