import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { activeRequestConflictMessage, findActiveRequestConflict } from "../request-conflict.mjs";
import { submitMaintenanceRequest } from "../request-submit.mjs";
import { parseRequestTimelineTimestamp, validateRequestTimelineChange } from "../request-timeline.mjs";

const client = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const request = { ref: "REQ-100", door: "D36-Z0164", chassis: "CH-100", site: "Sasti OB", complaint: "Engine noise", meterType: "HMR" };
const saved = { ...request, status: "Open", requesterLogin: "production" };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const evaluate = (source, dependencies) => new Function(...Object.keys(dependencies), source)(...Object.values(dependencies));

function createRoute({ conflict = null, insertError, reports = async () => {}, notify = async () => {} } = {}) {
  let handler, status, body, inserts = 0;
  const followups = [], errors = [], logs = [];
  const pool = { query: async sql => {
    assert.match(sql, /INSERT INTO maintenance_requests/);
    if (insertError) throw insertError;
    inserts++;
    return { rows: [saved] };
  } };
  const snippet = server.slice(server.indexOf("app.post('/api/requests',"), server.indexOf("app.patch('/api/requests/:reference',"));
  evaluate(snippet, {
    app: { post: (_path, ...handlers) => { handler = handlers.at(-1); } },
    requireSession: () => {}, requirePermission: () => () => {},
    validRequestAudioDataUrl: () => true,
    currentUserRecord: async () => ({ site: request.site }),
    canonicalSiteName: value => value,
    createRequestWithVehicleLock: async (_identity, write) => {
      if (conflict) throw Object.assign(new Error(activeRequestConflictMessage(conflict, request.door)), { duplicate: true, existingReference: conflict.ref });
      return write(pool);
    },
    pool, parseRequestTimelineTimestamp, validateRequestTimelineChange,
    recordRequestTimeline: async () => {},
    maintenanceWriteFailure: (error, _res, next) => next(error),
    requestProjection: "reference AS ref",
    setImmediate: callback => followups.push(callback),
    sendRequestEventReports: reports,
    requestStakeholderLogins: async () => ["production"],
    requestWorkflowWhatsAppLogins: async () => ["production"],
    workflowRequestLink: () => "https://example.com/request", publicBaseUrl: () => "https://example.com",
    requestEquipmentNotificationDetails: row => row.door,
    requestNotificationTime: value => value.toISOString(),
    addTicketNotificationsBestEffort: notify,
    console: { error: (...args) => logs.push(args) },
  });
  return {
    run: () => handler({ body: request, session: { role: "normal", login: "production", name: "Production User" } }, {
      status(value) { status = value; return this; },
      json(value) { assert.equal(body, undefined, "only one response is sent"); body = value; return this; },
    }, error => errors.push(error)),
    result: () => ({ status, body, inserts }), followups, errors, logs,
  };
}

test("creation acknowledges the saved row before slow reports and still sends opening notifications", async () => {
  const delivery = deferred();
  const events = [];
  const route = createRoute({
    reports: async (type, row) => { events.push([type, row.ref]); await delivery.promise; },
    notify: async (_pool, recipients, ref) => events.push(["notified", ref, recipients]),
  });
  await route.run();
  assert.deepEqual(route.result(), { status: 201, body: saved, inserts: 1 });
  assert.equal(route.followups.length, 1);
  const pending = route.followups[0]();
  assert.deepEqual(events, [["opened", saved.ref]]);
  delivery.resolve();
  await pending;
  assert.deepEqual(events[1], ["notified", saved.ref, ["production"]]);
  assert.deepEqual(route.errors, []);
});

test("notification failure cannot turn a saved request into an HTTP error", async () => {
  const route = createRoute({ notify: async () => { throw new Error("Delivery unavailable"); } });
  await route.run();
  await route.followups[0]();
  assert.equal(route.result().status, 201);
  assert.equal(route.result().inserts, 1);
  assert.equal(route.logs.length, 1);
  assert.deepEqual(route.errors, []);
});

test("a genuinely existing active request still returns 409 without inserting or notifying", async () => {
  const route = createRoute({ conflict: { ...saved, ref: "REQ-OLDER" } });
  await route.run();
  const result = route.result();
  assert.equal(result.status, 409);
  assert.equal(result.body.existingReference, "REQ-OLDER");
  assert.equal(result.body.duplicate, true);
  assert.equal(result.inserts, 0);
  assert.equal(route.followups.length, 0);
});

test("database failure never acknowledges creation or schedules notifications", async () => {
  const error = new Error("Database unavailable");
  const route = createRoute({ insertError: error });
  await route.run();
  assert.equal(route.result().body, undefined);
  assert.equal(route.followups.length, 0);
  assert.deepEqual(route.errors, [error]);
});

function addRequestHarness(fetch) {
  let rows = [], refreshes = 0;
  const snippet = client.slice(client.indexOf("    addRequest = async"), client.indexOf("    updateRequest = async")).trim().replace(/,$/, ";");
  const add = evaluate(`const ${snippet} return addRequest;`, {
    fetch, session: { token: "test" }, authToken: "test",
    requestLoadSequence: { current: 0 }, notifyRequestChange: () => {}, window: {},
    setRequests: update => { rows = update(rows); },
    loadRequests: () => { refreshes++; return new Promise(() => {}); },
  });
  return { add, rows: () => rows, refreshes: () => refreshes };
}

test("only persisted requests enter the list and creation does not wait for a second list fetch", async () => {
  const response = deferred();
  const app = addRequestHarness(() => response.promise);
  const pending = app.add(request);
  assert.deepEqual(app.rows(), [], "an unsaved row must not trigger the duplicate check");
  response.resolve({ ok: true, json: async () => saved });
  assert.deepEqual(await pending, saved);
  assert.deepEqual(app.rows(), [saved]);
  assert.equal(app.refreshes(), 0);
});

test("a failed POST leaves no phantom request and preserves duplicate details", async () => {
  const app = addRequestHarness(async () => ({ ok: false, json: async () => ({ error: "Already open", duplicate: true, existingReference: "REQ-OLDER" }) }));
  await assert.rejects(app.add(request), error => error.duplicate && error.existingReference === "REQ-OLDER");
  assert.deepEqual(app.rows(), []);
  const offline = addRequestHarness(async () => { throw new Error("Offline"); });
  await assert.rejects(offline.add(request), /Offline/);
  assert.deepEqual(offline.rows(), []);
});

// Run the real effect against controlled timers and responses, including a poll
// that sees the inserted row while the create response is still in flight.
function conflictHarness({ submitting = false, rows = [], fetch = async () => ({ ok: true, json: async () => ({ duplicate: false }) }) } = {}) {
  const submittingRef = { current: submitting };
  const alerts = [], timers = [];
  let conflict = null, cleanup;
  const end = client.indexOf("  const submit = async (e) =>", client.indexOf("function MaintenanceForm"));
  const start = client.lastIndexOf("  useEffect(() => {", end);
  evaluate(client.slice(start, end), {
    useEffect: effect => { cleanup = effect(); },
    door: request.door, equipmentDetails: request, activeRequestRecords: rows,
    submitting, submittingRef, conflictAlerted: { current: "" },
    setCheckingConflict: () => {}, setDuplicateConflict: value => { conflict = value; },
    activeRequestConflictMessage, findActiveRequestConflict, fetch, URLSearchParams, authToken: "test",
    window: { alert: message => alerts.push(message), setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout: () => {} },
  });
  return { submittingRef, alerts, timers, conflict: () => conflict, cleanup: () => cleanup?.() };
}

test("a request discovered by polling during submission does not warn about itself", () => {
  const form = conflictHarness({ submitting: true, rows: [saved] });
  assert.deepEqual(form.alerts, []);
  assert.equal(form.conflict(), null);
  assert.equal(form.timers.length, 0);
});

test("a late duplicate-check response is ignored as soon as submission starts", async () => {
  const response = deferred();
  const form = conflictHarness({ fetch: () => response.promise });
  const pending = form.timers[0]();
  form.submittingRef.current = true;
  response.resolve({ ok: true, json: async () => ({ duplicate: true, existingReference: request.ref }) });
  await pending;
  assert.deepEqual(form.alerts, []);
  assert.equal(form.conflict(), null);
});

test("conflict checks still block pre-existing requests locally and from the server", async () => {
  const local = conflictHarness({ rows: [saved] });
  assert.equal(local.conflict().existingReference, saved.ref);
  assert.equal(local.alerts.length, 1);
  const remote = conflictHarness({ fetch: async () => ({ ok: true, json: async () => ({ duplicate: true, existingReference: "REQ-OTHER" }) }) });
  await remote.timers[0]();
  assert.equal(remote.conflict().existingReference, "REQ-OTHER");
  assert.equal(remote.alerts.length, 1);
});

test("two submit events before React re-renders save once and close after persistence", async () => {
  const response = deferred();
  let saves = 0, closes = 0, submitting = false;
  const alerts = [], submittingRef = { current: false };
  const start = client.indexOf("  const submit = async (e) =>", client.indexOf("function MaintenanceForm"));
  const end = client.indexOf("  return (", start);
  const submit = evaluate(`${client.slice(start, end)} return submit;`, {
    submitting: false, submittingRef, checkingConflict: false, duplicateConflict: null,
    FormData: class { get(name) { return request[name] || ""; } },
    requestEquipmentMeterType: () => "HMR", v: {}, equipmentDetails: request,
    equipmentGroup: "", currentLocation: request.site, driverLookup: { name: "" },
    setSubmitting: value => { submitting = value; }, setCheckingConflict: () => {}, setDuplicateConflict: () => {},
    submitMaintenanceRequest, activeRequestConflictMessage,
    onSubmit: () => { saves++; return response.promise; },
    close: () => { closes++; }, alert: message => alerts.push(message),
  });
  const event = { preventDefault() {}, currentTarget: {} };
  const first = submit(event);
  await submit(event);
  assert.equal(saves, 1);
  assert.equal(submitting, true);
  assert.equal(closes, 0);
  assert.deepEqual(alerts, []);
  response.resolve(saved);
  await first;
  assert.equal(closes, 1);
  assert.deepEqual(alerts, []);
  assert.equal(submitting, false);
  assert.equal(submittingRef.current, false);
});
