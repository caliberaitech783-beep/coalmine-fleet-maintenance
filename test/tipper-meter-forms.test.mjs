import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {transformWithOxc} from "vite";
import * as equipment from "../request-equipment.mjs";
import * as workflow from "../request-workflow.mjs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const evaluate = (code, dependencies) => new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
const tipper = {ref: "REQ-T1", equipmentGroup: "TIPPERS", meterType: "KMR", door: "T1", chassis: "CH1", site: "Sasti OB", status: "In progress", openingMeterReading: "1000", openingMeterFileUploaded: true};
const snippet = source.slice(source.indexOf("function MeterReadingFields"), source.indexOf("function VerifyRequestForm"));
const transformed = await transformWithOxc(snippet, "request-forms.jsx", {jsx: {runtime: "classic"}});
const forms = evaluate(transformed.code + "\nreturn {RequestEditForm, CloseRequestForm};", {
  React, ...equipment,
  useState: value => [typeof value === "function" ? value() : value, () => {}],
  useRef: value => ({current: value}),
  useMemo: fn => fn(), useMasterRecords: () => [[]],
  normalizeEquipmentGroup: value => value, arrivalRedFlagRequired: () => false, delayedReasonRequired: () => false, MaintenanceEtcInput: () => null,
  Modal: ({children}) => React.createElement("section", null, children),
  MeterFileCell: () => React.createElement("span", null, "Saved trip card"),
  ChevronRight: () => null,
  EnhancedSpeechComplaint: () => null,
  requestStartParts: () => ({date: "2026-09-09", time: "12:00:00"}),
  TIME_24H_PATTERN: ".*",
  FormData: class { constructor(values) { this.values = values; } get(key) { return this.values[key] ?? null; } },
  alert: message => { throw new Error(message); },
});

test("tipper edit and close forms render both readings and exactly one trip-card file chooser", () => {
  for (const [name, stage] of [["RequestEditForm", "opening"], ["CloseRequestForm", "closing"]]) {
    const html = renderToStaticMarkup(React.createElement(forms[name], {request: tipper}));
    assert.match(html, new RegExp(`name="${stage}HMRReading"`));
    assert.match(html, new RegExp(`name="${stage}KMRReading"`));
    assert.equal((html.match(/type="file"/g) || []).length, 1);
    assert.match(html, /Trip card upload/);
    assert.match(html, /accept="image\/jpeg,image\/png,image\/webp,application\/pdf"/);
  }
});

test("non-tipper forms retain the asset's single meter", () => {
  for (const meterType of ["HMR", "KMR"]) {
    const html = renderToStaticMarkup(React.createElement(forms.RequestEditForm, {request: {...tipper, equipmentGroup: "OTHER", meterType}}));
    assert.match(html, new RegExp(`name="opening${meterType}Reading"`));
    assert.doesNotMatch(html, new RegExp(`name="opening${meterType === "HMR" ? "KMR" : "HMR"}Reading"`));
  }
});

test("edit and close submissions send both readings and keep the legacy primary value", async () => {
  for (const [name, stage] of [["RequestEditForm", "opening"], ["CloseRequestForm", "closing"]]) {
    let saved;
    const element = forms[name]({request: tipper, onSave: value => { saved = value; }});
    await element.props.children.props.onSubmit({preventDefault() {}, currentTarget: {[`${stage}HMRReading`]: "12.25", [`${stage}KMRReading`]: "1001"}});
    assert.deepEqual(saved[`${stage}MeterReadings`], {HMR: "12.25", KMR: "1001"});
    assert.equal(saved[`${stage}MeterReading`], "1001");
    assert.equal(saved[`${stage}MeterFile`], "", "an existing file does not require another upload");
    assert.deepEqual(equipment.requestMeterReadings({...tipper, ...saved}, stage), {HMR: "12.25", KMR: "1001"});
  }
});

async function runRoute(action, body) {
  let handler, status = 200, result;
  const writes = [];
  const start = `app.patch('/api/requests/:reference${action}'`;
  const route = server.slice(server.indexOf(start), server.indexOf("\napp.", server.indexOf(start) + start.length));
  evaluate(route, {
    ...workflow,
    app: {patch: (_path, ...handlers) => { handler = handlers.at(-1); }},
    requireSession: () => {}, requirePermission: () => () => {},
    withMaintenanceArrivalGuard: async (_req, _ref, callback) => callback({query: async (sql, values) => {
      if (/^UPDATE/.test(sql)) { writes.push({sql, values}); return {rows: [tipper]}; }
      return {rows: [{...tipper, meter_type: "KMR", opening_meter_file: "saved-opening", closing_meter_file: "saved-closing"}]};
    }}, tipper),
    withRequestTimelineTransaction: async (_req, _ref, callback) => callback({query: async (sql, values) => {
      writes.push({sql, values}); return {rows: [{...tipper, status: "Closed", verifiedAt: "2026-09-09 12:00:00"}]};
    }}, {...tipper, status: "Closed"}),
    requestExpectedCompletionValue: (_before, next) => next, validateRequestTimelineChange: () => {}, buildRequestTimelineChanges: () => {},
    arrivalFlagReadySql: "true", delayedReasonRequired: () => false, parseRequestTimelineTimestamp: value => new Date(value),
    maintenanceWriteFailure: (error, res, next) => error.status ? res.status(error.status).json({error: error.message}) : next(error),
    requestWorkflowWhatsAppLogins: async () => [], requestEquipmentNotificationDetails: () => "", requestNotificationTime: () => "",
    addTicketNotificationsBestEffort: async () => {}, workflowRequestLink: () => "", publicBaseUrl: () => "",
    requireAllowedRequestSite: async () => true, assignedRequestScope: async () => ({}), requestSiteIsAllowed: () => true,
    parseIndiaRequestDateTime: () => new Date(), requestProjection: "reference AS ref",
    currentUserRecord: async () => ({site: tipper.site}), canonicalSiteName: value => value,
    pool: {query: async (sql, values) => {
      if (/^UPDATE/.test(sql)) { writes.push({sql, values}); return {rows: [tipper]}; }
      return {rows: [{...tipper, status: action === "/verify" ? "Closed" : tipper.status, meter_type: "KMR", opening_meter_file: "saved-opening", closing_meter_file: "saved-closing"}]};
    }},
    sendRequestEventReports: async () => {}, requestStakeholderLogins: async () => [], addTicketNotifications: async () => {},
  });
  await handler({params: {reference: tipper.ref}, body, session: {name: "Maintenance"}}, {
    status(value) { status = value; return this; }, json(value) { result = value; return this; },
  }, error => { throw error; });
  return {status, result, writes};
}

test("edit API persists both opening readings with one shared attachment", async () => {
  const result = await runRoute("", {...tipper, complaint: "Noise", expectedCompletionAt: "2026-09-09T18:00", openingMeterReading: "1000", openingMeterReadings: {HMR: "12", KMR: "1000"}});
  assert.equal(result.status, 200);
  assert.deepEqual(JSON.parse(result.writes[0].values[9]), {HMR: "12", KMR: "1000"});
  assert.match(result.writes[0].sql, /ELSE opening_meter_file END/);
});

test("close API saves both closing readings and a shared trip card", async () => {
  const card = "data:application/pdf;base64,JVBERg==";
  const result = await runRoute("/close", {closingDate: "2026-09-09", closingTime: "12:00:00", maintenanceWork: "Repaired", status: "In progress", meterType: "KMR", closingMeterReading: "1001", closingMeterReadings: {HMR: "13", KMR: "1001"}, closingMeterFile: card, closingMeterFileName: "trip.pdf"});
  assert.equal(result.status, 200);
  assert.deepEqual(JSON.parse(result.writes[0].values[6]), {HMR: "13", KMR: "1001"});
  assert.equal(result.writes[0].values[8], card);
  assert.equal(result.writes[0].values[9], "trip.pdf");
});

test("invalid secondary readings are rejected before any edit or close writes", async () => {
  for (const action of ["", "/close"]) {
    const result = await runRoute(action, {...tipper, complaint: "Noise", expectedCompletionAt: "2026-09-09T18:00", openingMeterReading: "1000", openingMeterReadings: {HMR: "-1", KMR: "1000"}, closingDate: "2026-09-09", closingTime: "12:00:00", maintenanceWork: "Repaired", status: "In progress"});
    assert.equal(result.status, 400);
    assert.equal(result.writes.length, 0);
  }
});

test("verification preserves a trip card already uploaded at closure", async () => {
  const result = await runRoute("/verify", {firstTripCardImage: "data:image/jpeg;base64,/9j/2Q==", closingMeterReading: "1001", closingMeterReadings: {HMR: "13", KMR: "1001"}});
  assert.equal(result.status, 200);
  assert.doesNotMatch(result.writes[0].sql, /closing_meter_file=/);
  assert.deepEqual(JSON.parse(result.writes[0].values[8]), {HMR: "13", KMR: "1001"});
});
