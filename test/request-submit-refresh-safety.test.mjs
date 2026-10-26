import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {transformWithOxc} from "vite";
import {submitMaintenanceRequest} from "../request-submit.mjs";
import {createSiteUpdateSafety, SITE_UPDATE_SETTLE_MS} from "../src/site-update-safety.mjs";

const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const handlers = new Map();
for (const [name, next] of [
  ["MaintenanceForm", "Subsidiaries"], ["RequestEditForm", "CloseRequestForm"],
  ["CloseRequestForm", "VerifyRequestForm"], ["VerifyRequestForm", "ProductionFirstTripForm"],
]) {
  const start = main.indexOf(`function ${name}(`), end = main.indexOf(`function ${next}(`, start);
  assert.ok(start >= 0 && end > start, `locate ${name}`);
  const component = main.slice(start, end);
  let declaration;
  if (name === "MaintenanceForm") {
    const submit = component.indexOf("  const submit = async (e) =>");
    declaration = component.slice(submit, component.indexOf("  return (", submit));
  } else {
    const marker = "onSubmit={async (event) => {";
    const submit = component.indexOf(marker), endSubmit = component.indexOf("\n    }}>", submit);
    assert.ok(submit >= 0 && endSubmit > submit, `locate ${name} submit handler`);
    declaration = `const submit = ${component.slice(submit + "onSubmit={".length, endSubmit)}\n};`;
  }
  handlers.set(name, (await transformWithOxc(declaration, `${name}-submit.jsx`, {jsx: {runtime: "classic"}})).code);
}

const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};

function fixture(name, overrides = {}) {
  let at = 59000;
  const safety = createSiteUpdateSafety({now: () => at});
  const media = deferred(), persistence = deferred();
  const observed = {submitting: false, saved: [], errors: [], closes: 0};
  const request = {ref: "R1", door: "D1", acceptedAt: "2026-10-19 10:00:00", meterType: "HMR"};
  const image = {name: "trip-card.jpg", type: "image/jpeg", size: 1024};
  const bindings = {
    siteUpdateSafety: safety, submitMaintenanceRequest,
    submitting: false, submittingRef: {current: false}, submitLock: {current: false},
    checkingConflict: false, duplicateConflict: null, existingReason: "", v: {},
    requestEquipmentMeterType: () => "HMR", equipmentDetails: {...request, equipment: "Test vehicle"},
    equipmentGroup: "TIPPER", currentLocation: "Sasti OB", driverLookup: {name: ""},
    FormData: class {
      get(key) { return ({category: "Breakdown", date: "2026-10-19", time: "10:00:00", complaintPhoto: image})[key] ?? ""; }
      getAll() { return []; }
    },
    request, equipmentRecords: [], editCategory: "Breakdown", acceptingRequest: false,
    arrivalRedFlagRequired: () => false, onRequireArrivalFlag: undefined, etcChanged: false, etcDelayed: false,
    canEditResponsibility: false, meterType: "HMR", openingMeterFile: image, tripCardFile: image,
    meterReadingsFromForm: () => ({HMR: "100"}), firstTripDone: true,
    addonEligible:false,addonDraft:{current:null},addonDecision:{current:false},setAddonEditing(){},setAddonPrompt(){},targetReferences:[request.ref],
    linkedTickets: [request], ticketDecision: {current: true}, idleDecision: {current: true},
    status: "Closed", ideal: false, idleReason: "", turnaroundTime: "1h", storedDelayedReason: "",
    requestStartParts: () => ({date: "2026-10-19", time: "10:00:00"}),
    setSubmitting(value) { observed.submitting = value; },
    setFormError(message) { if (message) observed.errors.push(message); },
    alert(message) { observed.errors.push(message); },
    setCheckingConflict() {}, setDuplicateConflict() {}, setTicketPrompt() {}, setIdlePrompt() {},
    setClosingDate() {}, setTime() {},
    readComplaintMedia: () => media.promise, readMeterEvidence: () => media.promise, fileAsDataUrl: () => media.promise,
    close() { observed.closes++; },
    ...overrides,
  };
  bindings.onSubmit = bindings.onSave = payload => { observed.saved.push(payload); return persistence.promise; };
  const submit = new Function(...Object.keys(bindings), `${handlers.get(name)};return submit;`)(...Object.values(bindings));
  return {safety, media, persistence, observed, setTime: value => { at = value; }, submit: () => submit({preventDefault() {}, currentTarget: {}})};
}

for (const name of handlers.keys()) {
  test(`${name} protects media preparation, persistence and the settling interval`, async () => {
    const view = fixture(name);
    const saving = view.submit();
    assert.equal(view.observed.submitting, true);
    assert.equal(view.observed.saved.length, 0, "media preparation precedes the API callback");
    view.setTime(61000);
    assert.equal(view.safety.getState(60000).pendingCount, 1);
    assert.equal(view.safety.getState(60000).canRefresh, false);
    await view.submit();
    assert.equal(view.safety.getState(60000).pendingCount, 1, "duplicate clicks create no extra lease");
    view.media.resolve("data:image/webp;base64,evidence");
    await flush();
    assert.equal(view.observed.saved.length, 1);
    assert.equal(view.safety.getState(60000).canRefresh, false, "persistence is still pending");
    view.persistence.resolve({ref: "R1", status: "Closed"});
    await saving;
    assert.equal(view.observed.submitting, false);
    assert.deepEqual(view.observed.errors, []);
    assert.equal(view.safety.getState(60000).pendingCount, 0);
    assert.equal(view.safety.getState(60000).failedCount, 0);
    assert.equal(view.safety.getState(60000).reason, "settling");
    view.setTime(61000 + SITE_UPDATE_SETTLE_MS);
    assert.equal(view.safety.getState(60000).canRefresh, true);
  });

  test(`${name} retains failures from media preparation or persistence for review`, async () => {
    for (const stage of ["media", "persistence"]) {
      const view = fixture(name);
      const saving = view.submit();
      const error = new Error(`${stage} failed: preserve these form details`);
      if (stage === "media") view.media.reject(error);
      else {
        view.media.resolve("data:image/webp;base64,evidence");
        await flush();
        view.persistence.reject(error);
      }
      await saving;
      view.setTime(90000);
      assert.equal(view.observed.submitting, false);
      assert.deepEqual(view.observed.errors, [error.message]);
      assert.equal(view.observed.closes, 0);
      assert.equal(view.safety.getState(60000).pendingCount, 0);
      assert.equal(view.safety.getState(60000).failedCount, 1);
      assert.equal(view.safety.getState(60000).canRefresh, false);
      assert.equal(view.observed.saved.length, stage === "media" ? 0 : 1);
    }
  });
}

test("validation and unanswered close prompts do not start a submission or record a failed save", async () => {
  for (const [name, overrides] of [
    ["MaintenanceForm", {v: null}],
    ["RequestEditForm", {arrivalRedFlagRequired: () => true}],
    ["CloseRequestForm", {idleDecision: {current: false}}],
    ["VerifyRequestForm", {tripCardFile: null}],
  ]) {
    const view = fixture(name, overrides);
    await view.submit();
    view.setTime(61000);
    assert.equal(view.observed.submitting, false, name);
    assert.equal(view.observed.saved.length, 0, name);
    assert.equal(view.safety.getState(60000).pendingCount, 0, name);
    assert.equal(view.safety.getState(60000).failedCount, 0, name);
    assert.equal(view.safety.getState(60000).canRefresh, true, name);
  }
});
