import {requestStatusLabel} from '../src/request-status.mjs';
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { transformWithOxc } from "vite";
import {formatTimelineDuration, requestTimelineEvents, requestTimelineDurations, buildRequestTimelineChanges} from "../request-timeline.mjs";
import * as equipment from "../request-equipment.mjs";

const source = readFileSync(new URL("../src/request-timeline.jsx", import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "").replace(/export (?:default )?function /g, "function ");
const code = (await transformWithOxc(source, "request-timeline.jsx", {jsx: {runtime: "classic"}})).code;
const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const formCode = {};
for (const [name, end] of [["RequestEditForm", "CloseRequestForm"], ["CloseRequestForm", "VerifyRequestForm"], ["VerifyRequestForm", "TicketCreateForm"]]) {
  const helpers = main.slice(main.indexOf('function MeterReadingFields('), main.indexOf('function RequestEditForm('));
  formCode[name] = (await transformWithOxc(helpers + main.slice(main.indexOf(`function ${name}(`), main.indexOf(`function ${end}(`)), `${name}.jsx`, {jsx: {runtime: "classic"}})).code;
}
const Null = () => null;
const Dialog = () => null;
const settle = () => new Promise(resolve => setImmediate(resolve));
const all = (tree, predicate) => {
  const result = [];
  const visit = node => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!React.isValidElement(node)) return;
    if (predicate(node)) result.push(node);
    visit(node.props.children);
  };
  visit(tree); return result;
};
const text = node => Array.isArray(node) ? node.map(text).join("") : React.isValidElement(node) ? text(node.props.children) : typeof node === "string" || typeof node === "number" ? String(node) : "";
const button = (tree, label) => all(tree, node => node.type === "button" && text(node).trim() === label)[0];
const field = (tree, name) => {
  const node = all(tree, node => node.props.name === name || (name === "expectedCompletionAt" && node.type === "maintenance-etc"))[0];
  return node?.type === "maintenance-etc" ? {...node, props: {...node.props, onChange: event => node.props.onChange(event.target.value)}} : node;
};
const form = tree => all(tree, node => node.type === "form")[0];
const alerts = tree => all(tree, node => node.props.role === "alert").map(text).join(" ");

function harness(name, extra = {}) {
  let cursor = 0, props;
  const slots = [], queued = [], effects = new Map(), requests = [];
  const useState = initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], value => {slots[index] = typeof value === "function" ? value(slots[index]) : value;}];
  };
  const useEffect = (effect, deps) => {
    const index = cursor++;
    const prior = effects.get(index);
    if (!prior || deps.some((value, i) => !Object.is(value, prior.deps[i]))) queued.push(() => {prior?.cleanup?.(); effects.set(index, {deps, cleanup: effect()});});
  };
  const scope = {requestStatusLabel,
    ...equipment,
    React, useState, useEffect, useRef: value => useState(() => ({current: value}))[0], useMemo: fn => fn(),
    formatTimelineDuration, AbortController,
    fetch: (url, options) => new Promise((resolve, reject) => requests.push({url, options, reject,
      respond(data, ok = true) {resolve({ok, json: async () => data});},
      malformed() {resolve({ok: true, json: async () => {throw new Error("Bad JSON");}});},
    })),
    Modal: Null, MeterFileCell: Null, EnhancedSpeechComplaint: Null, VerificationTimeField: Null, ChevronRight: Null, MaintenanceEtcInput: "maintenance-etc",
    requestStartParts: () => ({date: "2026-09-08", time: "12:00:00"}), requestMeterTypeForRequest: () => "KMR",
    useMasterRecords: () => [[]], normalizeEquipmentGroup: value => value,
    formatTwelveHourDateTime: value => value || "Not recorded", delayedReasonRequired: () => false,
    arrivalRedFlagRequired: () => false, TIME_24H_PATTERN: ".*", readMeterEvidence: async () => "fixture",
    FormData: class {constructor(values) {this.values = values;} get(key) {return this.values[key] ?? "";}},
    URL: {createObjectURL: () => "fixture:preview", revokeObjectURL() {}},
    FileReader: class {readAsDataURL() {this.result = "data:image/png;base64,dGVzdA=="; this.onload();}},
    alert() {assert.fail("workflow errors must not use native alerts");},
    ...extra,
  };
  const compiled = formCode[name] || code;
  const component = new Function(...Object.keys(scope), `${compiled}; return ${name};`)(...Object.values(scope));
  return {
    requests,
    render(next = props) {props = next; cursor = 0; return component(props);},
    effects() {queued.splice(0).forEach(effect => effect());},
    unmount() {for (const effect of effects.values()) effect.cleanup?.();},
  };
}

const request = {ref: "QA-TIMELINE-01", start: "2026-09-08T04:30:00Z", acceptedAt: "2026-09-08T04:40:00Z", closedAt: "2026-09-08T05:30:00Z", firstTripAt: "2026-09-08T05:40:00Z", verifiedAt: "2026-09-08T05:42:00Z", expectedCompletionAt: "2026-09-08T06:00:00Z"};
const body = (reference = request.ref, overrides = {}) => ({reference, request, events: requestTimelineEvents(request), history: [], durations: requestTimelineDurations(request), ...overrides});

test("timeline button does not fetch or mount content until opened and preserves accessible request identity", () => {
  const app = harness("RequestTimelineButton");
  const props = {reference: request.ref, token: "qa-token", Dialog, label: "View time breakdown"};
  let tree = app.render(props); app.effects();
  assert.equal(app.requests.length, 0);
  assert.equal(all(tree, node => node.type === Dialog).length, 0);
  assert.equal(button(tree, "View time breakdown").props["aria-label"], `View time breakdown for ${request.ref}`);
  button(tree, "View time breakdown").props.onClick();
  tree = app.render();
  const dialog = all(tree, node => node.type === Dialog)[0];
  assert.equal(dialog.props.title, `Time breakdown · ${request.ref}`);
  assert.equal(dialog.props.children.props.reference, request.ref);
  assert.equal(dialog.props.children.props.token, "qa-token");
  dialog.props.close();
  assert.equal(all(app.render(), node => node.type === Dialog).length, 0);
  button(app.render(), "View time breakdown").props.onClick(); app.render();
  app.render({...props, token: "other-account"}); app.effects();
  assert.equal(all(app.render(), node => node.type === Dialog).length, 0);
  assert.equal(harness("RequestTimelineButton").render({reference: "", token: "qa", Dialog}), null);
});

test("opening timeline fetches the encoded request-scoped endpoint with current authorization and no cache", async () => {
  const app = harness("RequestTimelineContent");
  const reference = "QA/request #01";
  assert.match(text(app.render({reference, token: "qa-token"})), /Loading recorded times/); app.effects();
  assert.equal(app.requests[0].url, "/api/requests/QA%2Frequest%20%2301/timeline");
  assert.equal(app.requests[0].options.headers.Authorization, "Bearer qa-token");
  assert.equal(app.requests[0].options.cache, "no-store");
  app.requests[0].respond(body(reference)); await settle();
  assert.equal(app.render().props.data.reference, reference);
});

test("timeline request changes abort old reads and never render a stale response", async () => {
  const app = harness("RequestTimelineContent");
  app.render({reference: "QA-OLD", token: "qa"}); app.effects();
  app.render({reference: "QA-NEW", token: "qa"}); app.effects();
  assert.equal(app.requests[0].options.signal.aborted, true);
  app.requests[1].respond(body("QA-NEW")); await settle();
  app.requests[0].respond(body("QA-OLD")); await settle();
  assert.equal(app.render().props.data.reference, "QA-NEW");
});

test("account changes hide prior timeline immediately and unmount aborts pending requests", async () => {
  const app = harness("RequestTimelineContent");
  app.render({reference: request.ref, token: "qa-admin"}); app.effects();
  app.requests[0].respond(body()); await settle();
  assert.equal(app.render().props.data.reference, request.ref);
  assert.match(text(app.render({reference: request.ref, token: "qa-production"})), /Loading recorded times/);
  app.effects();
  assert.equal(app.requests[0].options.signal.aborted, true);
  assert.equal(app.requests[1].options.headers.Authorization, "Bearer qa-production");
  app.unmount();
  assert.equal(app.requests[1].options.signal.aborted, true);
  app.requests[1].respond(body()); await settle();
  assert.match(text(app.render()), /Loading recorded times/);
});

test("timeline load errors are inline; retry remains scoped and rejects malformed or mismatched responses", async () => {
  const app = harness("RequestTimelineContent");
  app.render({reference: request.ref, token: "qa"}); app.effects();
  app.requests[0].respond({error: "This request belongs to a different location."}, false); await settle();
  assert.match(alerts(app.render()), /different location/);
  for (const invalid of [body("WRONG-REFERENCE"), body(request.ref, {events: null}), body(request.ref, {history: null}), body(request.ref, {durations: null})]) {
    button(app.render(), "Retry time breakdown").props.onClick(); app.render(); app.effects();
    app.requests.at(-1).respond(invalid); await settle();
    assert.match(alerts(app.render()), /response is incomplete/);
  }
  button(app.render(), "Retry time breakdown").props.onClick(); app.render(); app.effects();
  app.requests.at(-1).malformed(); await settle();
  assert.match(alerts(app.render()), /response is incomplete/);
  button(app.render(), "Retry time breakdown").props.onClick(); app.render(); app.effects();
  app.requests.at(-1).reject(new Error("Network interrupted")); await settle();
  assert.match(alerts(app.render()), /Network interrupted/);
  button(app.render(), "Retry time breakdown").props.onClick(); app.render(); app.effects();
  app.requests.at(-1).respond(body()); await settle();
  assert.equal(app.render().props.data.reference, request.ref);
  assert.equal(alerts(app.render()), "");
});

test("timeline view distinguishes recorded sources and never invents legacy actors or saved times", () => {
  const history = buildRequestTimelineChanges({}, request, {events: ["acceptedAt", "firstTripAt"], sources: {acceptedAt: "system", firstTripAt: "user"}, actorLogin: "QA-ACTOR", actorName: "QA Recorded Actor", now: "2026-09-08T05:42:00Z"});
  const events = requestTimelineEvents(request, history);
  const tree = harness("RequestTimelineView").render({data: body(request.ref, {history, events})});
  const group = all(tree, node => node.props.className === "request-timeline-events")[0];
  const articles = all(group, node => node.type === "article");
  const stage = key => articles.find(article => text(all(article, node => node.type === "h4")[0]) === events.find(event => event.event === key).label);
  assert.match(text(stage("acceptedAt")), /System recorded.*QA Recorded Actor/);
  assert.match(text(stage("firstTripAt")), /Form supplied.*QA Recorded Actor/);
  assert.match(text(stage("start")), /Source not recorded \(legacy\).*Recorded byNot recorded.*Saved atNot recorded/);
  assert.match(text(stage("acceptedAt")), /10:10:00 IST/);
  assert.match(text(tree), /does not independently prove/);
  assert.match(text(tree), /Older changes cannot be reconstructed/);
});

test("timeline shows planned ETC and corrected original/new values, reason, actor and saved timestamp", () => {
  const changed = {...request, expectedCompletionAt: "2026-09-08T07:00:00Z"};
  const history = buildRequestTimelineChanges(request, changed, {events: ["expectedCompletionAt"], sources: {expectedCompletionAt: "user"}, actorName: "QA Correction Author", actorLogin: "qa-editor", reason: "Replacement part ETA revised", now: "2026-09-08T06:15:00Z", requireCorrectionReason: ["expectedCompletionAt"]});
  const tree = harness("RequestTimelineView").render({data: body(request.ref, {request: changed, history, events: requestTimelineEvents(changed, history)})});
  assert.match(text(tree), /Expected completion \(planned\)/);
  const historyText = text(all(tree, node => node.props.className === "request-timeline-history")[0]);
  assert.match(historyText, /Corrected/);
  assert.match(historyText, /Original: .*11:30:00 IST/);
  assert.match(historyText, /Saved value: .*12:30:00 IST/);
  assert.match(historyText, /QA Correction Author.*11:45:00 IST.*Form supplied/);
  assert.match(historyText, /Reason: Replacement part ETA revised/);
});

test("timeline renders genuine zero separately from missing or negative duration and explains manager closure", () => {
  const idle = {...request, idealApprovedAt: request.closedAt, idealApprovedBy: "QA Manager"};
  const tree = harness("RequestTimelineView").render({data: body(request.ref, {request: idle, events: requestTimelineEvents(idle), durations: {waiting: 0, maintenance: null, returnToWork: -1, overall: 600_000}})});
  const stages = all(all(tree, node => node.props.className === "request-timeline-stages")[0], node => node.type === "article");
  assert.equal(text(all(stages[0], node => node.type === "strong")[0]), "0s");
  assert.equal(text(all(stages[1], node => node.type === "strong")[0]), "Not recorded");
  assert.equal(text(all(stages[2], node => node.type === "strong")[0]), "Not recorded");
  assert.match(text(tree), /manager’s on-road approval.*not a separately recorded repair-completion time/);
  assert.match(text(tree), /Manager on-road closure/);
  assert.match(text(tree), /Verification is shown separately, not added to the total/);
  const ordinary = harness("RequestTimelineView").render({data: body()});
  assert.doesNotMatch(text(ordinary), /This request closed through a manager/);
  assert.match(text(ordinary), /No timestamp-change history is recorded/);
});

const editProps = (extra = {}) => ({request: {ref: "QA-EDIT", start: "2026-09-08 10:00:00", acceptedAt: "2026-09-08 10:10:00", expectedCompletionAt: "2026-09-08 12:00:17", category: "Breakdown", complaint: "Fixture only", ...extra}, close() {}, onSave: async () => {}, repairTypesLoaded: true, repairTypeRecords: [{id: 1, repairType: "Breakdown"}]});
const submitValues = (extra = {}) => ({category: "Breakdown", complaint: "Fixture only", expectedCompletionAt: "2026-09-08T12:00", ...extra});
const submit = (tree, values) => form(tree).props.onSubmit({preventDefault() {}, currentTarget: values});

test("editing unchanged ETC preserves minute display without a correction prompt; changing it requires reason", async () => {
  const saved = [];
  const app = harness("RequestEditForm");
  const props = {...editProps(), onSave: async value => saved.push(value)};
  let tree = app.render(props);
  assert.equal(field(tree, "expectedCompletionAt").props.value, "2026-09-08T12:00");
  assert.equal(field(tree, "correctionReason"), undefined);
  await submit(tree, submitValues());
  assert.equal(saved.length, 1);
  field(app.render(), "expectedCompletionAt").props.onChange({target: {value: "2026-09-08T13:00"}});
  tree = app.render();
  assert.equal(field(tree, "correctionReason").props.required, true);
  assert.equal(field(tree, "correctionReason").props.maxLength, 500);
  assert.match(text(tree), /Previous ETC: 2026-09-08 12:00:17/);
  await submit(tree, submitValues({expectedCompletionAt: "2026-09-08T13:00", correctionReason: "  "}));
  assert.match(alerts(app.render()), /Explain why/);
  assert.equal(saved.length, 1);
  await submit(app.render(), submitValues({expectedCompletionAt: "2026-09-08T13:00", correctionReason: "  Parts delayed  "}));
  assert.equal(saved[1].correctionReason, "Parts delayed");
  assert.equal(saved[1].expectedCompletionAt, "2026-09-08T13:00");
  assert.equal(alerts(app.render()), "");
  field(app.render(), "expectedCompletionAt").props.onChange({target: {value: "2026-09-08T12:00"}});
  assert.equal(field(app.render(), "correctionReason"), undefined);
});

test("initial ETC has no correction reason and pending acceptance is not invented from device time", () => {
  const app = harness("RequestEditForm");
  let tree = app.render(editProps({expectedCompletionAt: "", acceptedAt: null, acceptanceRequired: true}));
  assert.match(text(tree), /server records the actual time/);
  assert.ok(all(tree, node => node.type === "input" && node.props.value === "Not accepted yet").length);
  field(tree, "expectedCompletionAt").props.onChange({target: {value: "2026-09-09T12:00"}});
  assert.equal(field(app.render(), "correctionReason"), undefined);
});

for (const name of ["RequestEditForm", "CloseRequestForm"]) test(`${name} retains the form and shows API rejection inline without native alerts`, async () => {
  const app = harness(name);
  const props = {...editProps(), onSave: async () => {throw new Error("Timeline ordering is invalid.");}};
  const tree = app.render(props);
  await submit(tree, submitValues({closingDate: "2026-09-08", closingTime: "12:00:00", maintenanceWork: "Test maintenance"}));
  assert.match(alerts(app.render()), /Timeline ordering is invalid/);
  assert.equal(button(app.render(), "Cancel").props.disabled, false);
});

test("MIS verification attachment validation and API rejection remain inline and preserve entered first-trip data", async () => {
  const app = harness("VerifyRequestForm");
  const props = {request: {...request, meterType: "KMR"}, close() {}, onSave: async () => {throw new Error("First trip cannot be before closure.");}};
  let tree = app.render(props);
  await submit(tree, {});
  assert.match(alerts(app.render()), /Upload the first-trip card/);
  field(app.render(), "firstTripCardImage").props.onChange({target: {files: [{type: "image/svg+xml", size: 50}]}});
  await submit(app.render(), {});
  assert.match(alerts(app.render()), /JPEG, PNG, or WebP/);
  field(app.render(), "firstTripCardImage").props.onChange({target: {files: [{type: "image/png", size: 50}]}});
  all(app.render(), node => node.type === "input" && node.props.type === "checkbox")[0].props.onChange({target: {checked: true}});
  tree = app.render();
  await submit(tree, {firstTripDate: "2026-09-08", firstTripTime: "10:00:00", closingMeterReading: "10"});
  assert.match(alerts(app.render()), /First trip cannot be before closure/);
  assert.ok(field(app.render(), "firstTripDate"));
  assert.equal(all(app.render(), node => node.type === "input" && node.props.type === "checkbox")[0].props.checked, true);
  assert.equal(button(app.render(), "Cancel").props.disabled, false);
});
