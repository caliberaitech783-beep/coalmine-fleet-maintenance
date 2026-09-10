import assert from "node:assert/strict";
import test from "node:test";
import {createDashboardRequestLoader, requestDateKey, requestEventDate, splitDashboardRequests} from "../src/dashboard-request-data.mjs";

const response = (body, {ok = true, status = 200} = {}) => ({ok, status, json: async () => body});
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};

test("selecting a recent opening date never removes an older open or Idle request from live data", () => {
  const older = Object.freeze({ref: "OLDER", status: "Open", start: "2026-09-01 · 09:00:00"});
  const idle = Object.freeze({ref: "IDLE", status: "Idle", start: "2026-09-02 · 09:00:00", idealRequestedAt: "2026-09-09 11:00:00"});
  const recent = Object.freeze({ref: "RECENT", status: "Closed", start: "2026-09-09T10:00:00+05:30"});
  const rows = Object.freeze([older, idle, recent]);
  const sets = splitDashboardRequests(rows, "2026-09-09");
  assert.deepEqual(sets.liveRequests, rows);
  assert.deepEqual(sets.historicalRequests, [recent]);
  assert.notEqual(sets.liveRequests, rows);
  assert.equal(sets.liveRequests[0], older);
  assert.deepEqual(rows, [older, idle, recent]);
});

test("no opening selection returns all requests, while an invalid date affects only the historical set", () => {
  const rows = [{ref: "UNDATED"}];
  assert.deepEqual(splitDashboardRequests(rows), {liveRequests: rows, historicalRequests: rows});
  for (const value of ["2026-02-30", "invalid", "2026-09-09T00:00:00Z"]) {
    assert.deepEqual(splitDashboardRequests(rows, value), {liveRequests: rows, historicalRequests: []});
  }
  assert.throws(() => splitDashboardRequests({requests: rows}), /must be an array/);
});

test("request days use India boundaries for UTC and explicit-offset timestamps", () => {
  assert.equal(requestDateKey("2026-09-08T18:29:59.999Z"), "2026-09-08");
  assert.equal(requestDateKey("2026-09-08T18:30:00Z"), "2026-09-09");
  assert.equal(requestDateKey(new Date("2026-09-08T18:30:00Z")), "2026-09-09");
  assert.equal(requestDateKey("2026-09-09T01:00:00+09:00"), "2026-09-08");
  assert.equal(requestDateKey("2026-09-08T23:00:00-04:00"), "2026-09-09");
  assert.equal(requestDateKey("2026-09-09T00:00:00+0530"), "2026-09-09");
});

test("local operational strings and valid date-only values keep their stated India day", () => {
  for (const input of ["2026-09-09 · 00:00:00", "2026-09-09 Â· 00:00:00", "2026-09-09 00:00:00", "2026-09-09T00:00", "2026-09-09"]) {
    assert.equal(requestDateKey(input), "2026-09-09");
  }
  assert.equal(requestDateKey("2024-02-29"), "2024-02-29");
});

test("missing, impossible and ambiguous dates never fabricate a current date", () => {
  for (const input of [undefined, null, "", " ", "not recorded", "2026-02-29", "2026-02-31T10:00:00", "2026-09-09T24:00:00", "09/09/2026", 0, new Date(NaN)]) {
    assert.equal(requestDateKey(input), "", String(input));
  }
});

test("Idle event uses actual Idle entry day, not submission or closure day", () => {
  const row = Object.freeze({status: "Closed", start: "2026-09-08 14:00:00", idealRequestedAt: "2026-09-09 09:00:00", closedAt: "2026-09-10 09:00:00"});
  assert.equal(requestEventDate(row, "idle"), "2026-09-09");
  assert.equal(requestEventDate({...row, idealRequestedAt: "2026-09-08T18:31:00Z"}, "idle"), "2026-09-09");
  assert.equal(requestEventDate({...row, idealRequestedAt: ""}, "idle"), "");
  assert.equal(requestEventDate({...row, idealRequestedAt: "invalid"}, "idle"), "");
  assert.equal(requestEventDate({idleRequestedAt: "2026-09-09 09:00:00"}, "idle"), "2026-09-09");
  assert.equal(requestEventDate({...row, idleRequestedAt: "2026-09-10 09:00:00"}, "idle"), "2026-09-09");
});

test("explicit lifecycle dates remain independent of the request's current status", () => {
  const row = {status: "Closed", start: "2026-09-01 11:00:00", closedAt: "2026-09-02 12:00:00", verifiedAt: "2026-09-03 13:00:00"};
  assert.equal(requestEventDate(row, "opened"), "2026-09-01");
  assert.equal(requestEventDate(row, "closed"), "2026-09-02");
  assert.equal(requestEventDate(row, "verified"), "2026-09-03");
  assert.equal(requestEventDate(row, "unknown"), "");
  assert.equal(requestEventDate({start: row.start}, "closed"), "");
  assert.equal(requestEventDate({closedAt: row.closedAt}, "verified"), "");
  assert.equal(requestEventDate(null, "opened"), "");
});

test("opening uses a recorded start, legacy startedAt or createdAt without synthesising one", () => {
  assert.equal(requestEventDate({start: "2026-09-01 10:00:00", createdAt: "2026-09-02 10:00:00"}, "opened"), "2026-09-01");
  assert.equal(requestEventDate({startedAt: "2026-09-02T19:00:00Z"}, "opened"), "2026-09-03");
  assert.equal(requestEventDate({start: "invalid", createdAt: "2026-09-03 10:00:00"}, "opened"), "2026-09-03");
  assert.equal(requestEventDate({}, "opened"), "");
});

test("historical opening filter compares India date, not an ISO string prefix", () => {
  const row = {ref: "UTC", start: "2026-09-08T19:00:00Z"};
  assert.deepEqual(splitDashboardRequests([row], "2026-09-09").historicalRequests, [row]);
  assert.deepEqual(splitDashboardRequests([row], "2026-09-08").historicalRequests, []);
});

test("loader requests authenticated read-only dashboard scope and establishes a genuine empty response", async () => {
  const calls = [];
  const states = [];
  const loader = createDashboardRequestLoader({now: () => 123, onState: (value) => states.push(value), fetchImpl: async (...args) => { calls.push(args); return response([]); }});
  assert.deepEqual(loader.getState(), {token: "", records: [], loaded: false, loading: false, error: "", updatedAt: 0});
  const result = await loader.load("demo-token");
  assert.equal(calls[0][0], "/api/requests?scope=dashboard&t=123");
  assert.equal(calls[0][1].method, "GET");
  assert.equal(calls[0][1].cache, "no-store");
  assert.equal(calls[0][1].headers.Authorization, "Bearer demo-token");
  assert.ok(calls[0][1].signal instanceof AbortSignal);
  assert.equal(states[0].loading, true);
  assert.deepEqual(result, {token: "demo-token", records: [], loaded: true, loading: false, error: "", updatedAt: 123});
});

test("loader refuses absent authentication without fetching or treating it as an empty fleet", async () => {
  let calls = 0;
  const loader = createDashboardRequestLoader({fetchImpl: async () => { calls += 1; return response([]); }});
  const state = await loader.load(" ");
  assert.equal(calls, 0);
  assert.equal(state.loaded, false);
  assert.match(state.error, /Sign in/);
});

test("invalid JSON and non-array payloads remain failures, never successful zero requests", async () => {
  const payloads = [response({requests: []}), response(null), response("[]"), {ok: true, json: async () => { throw new SyntaxError("bad JSON"); }}];
  for (const result of payloads) {
    const loader = createDashboardRequestLoader({fetchImpl: async () => result});
    const state = await loader.load("demo");
    assert.equal(state.loaded, false);
    assert.equal(state.loading, false);
    assert.ok(state.error);
    assert.equal(state.updatedAt, 0);
  }
});

test("same-session refresh errors retain previously loaded records and expose failure", async () => {
  let attempt = 0;
  const rows = [{ref: "EXISTING"}];
  const loader = createDashboardRequestLoader({fetchImpl: async () => ++attempt === 1 ? response(rows) : response({error: "Database unavailable"}, {ok: false, status: 503}), now: () => 10});
  await loader.load("demo");
  const state = await loader.load("demo");
  assert.deepEqual(state.records, rows);
  assert.equal(state.loaded, true);
  assert.equal(state.error, "Database unavailable");
  assert.equal(state.updatedAt, 10);
});

test("changed account clears old records immediately and an aborted stale response cannot overwrite its result", async () => {
  const slow = deferred();
  const states = [];
  const calls = [];
  const loader = createDashboardRequestLoader({onState: (state) => states.push(state), fetchImpl: async (_, options) => {
    calls.push(options);
    if (calls.length === 1) return response([{ref: "FIRST-ACCOUNT"}]);
    return calls.length === 2 ? slow.promise : response([{ref: "SECOND-ACCOUNT"}]);
  }});
  await loader.load("first");
  const oldLoad = loader.load("first");
  const newLoad = loader.load("second");
  assert.deepEqual(states.at(-1).records, []);
  assert.equal(states.at(-1).loaded, false);
  assert.equal(states.at(-1).token, "second");
  assert.equal(calls[1].signal.aborted, true);
  await newLoad;
  slow.resolve(response([{ref: "STALE"}]));
  await oldLoad;
  assert.equal(loader.getState().token, "second");
  assert.deepEqual(loader.getState().records, [{ref: "SECOND-ACCOUNT"}]);
});

test("latest refresh wins even when an older same-token fetch ignores abort", async () => {
  const slow = deferred();
  let attempt = 0;
  const loader = createDashboardRequestLoader({fetchImpl: async () => ++attempt === 1 ? slow.promise : response([{ref: "LATEST"}])});
  const older = loader.load("same");
  await loader.load("same");
  slow.resolve(response([{ref: "OLDER"}]));
  await older;
  assert.deepEqual(loader.getState().records, [{ref: "LATEST"}]);
});

test("cancel suppresses result publication after a hook unmounts", async () => {
  const slow = deferred();
  const states = [];
  let signal;
  const loader = createDashboardRequestLoader({onState: (state) => states.push(state), fetchImpl: async (_, options) => { signal = options.signal; return slow.promise; }});
  const pending = loader.load("demo");
  assert.equal(loader.cancel().loading, false);
  assert.equal(signal.aborted, true);
  slow.resolve(response([{ref: "TOO-LATE"}]));
  await pending;
  assert.equal(states.length, 1);
  assert.equal(loader.getState().loaded, false);
});

test("timeout settles even when transport ignores abort and retains same-session prior data", async () => {
  let attempts = 0;
  let stalledSignal;
  const loader = createDashboardRequestLoader({timeoutMs: 5, fetchImpl: async (_, options) => {
    if (++attempts === 1) return response([{ref: "RETAIN"}]);
    stalledSignal = options.signal;
    return new Promise(() => {});
  }});
  await loader.load("demo");
  const state = await loader.load("demo");
  assert.equal(stalledSignal.aborted, true);
  assert.match(state.error, /timed out/);
  assert.equal(state.loading, false);
  assert.equal(state.loaded, true);
  assert.deepEqual(state.records, [{ref: "RETAIN"}]);
});

test("an authentication or permission failure invalidates previous records rather than exposing stale access", async () => {
  for (const status of [401, 403]) {
    let calls = 0;
    const loader = createDashboardRequestLoader({fetchImpl: async () => ++calls === 1 ? response([{ref: "PRIVATE"}]) : response({error: "Access denied"}, {ok: false, status})});
    await loader.load("demo");
    const state = await loader.load("demo");
    assert.deepEqual(state.records, []);
    assert.equal(state.loaded, false);
    assert.equal(state.error, "Access denied");
    assert.equal(state.token, "demo");
  }
});

test("an expired session with non-JSON error content also discards earlier private records", async () => {
  let calls = 0;
  const loader = createDashboardRequestLoader({fetchImpl: async () => ++calls === 1
    ? response([{ref: "PRIVATE"}])
    : {ok: false, status: 401, json: async () => { throw new Error("not JSON"); }}});
  await loader.load("demo");
  const state = await loader.load("demo");
  assert.deepEqual(state.records, []);
  assert.equal(state.loaded, false);
  assert.ok(state.error);
});
