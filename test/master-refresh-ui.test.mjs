import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { watchVisibleMasterRefresh } from "../src/master-refresh.mjs";
import { watchRequestRefresh, REQUEST_CHANGE_STORAGE_KEY } from "../src/request-refresh.mjs";
import { readApiJson } from "../src/api-response.mjs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const hook = source.slice(source.indexOf("function useMasterRecords("), source.indexOf("function MetaWhatsAppSetup("));
const dashboardHook = source.slice(source.indexOf("function useDashboardEquipment("), source.indexOf("function FleetDataState("));
const settle = () => new Promise(resolve => setImmediate(resolve));
const oldEquipment = [{id: 1, door: "D-01"}];
const newEquipment = [...oldEquipment, {id: 2, door: "D-02"}];
function harness(hookName = "useMasterRecords") {
  let cursor = 0, now = 0, timerId = 0;
  const slots = [], effects = new Map(), queued = [], requests = [];
  const listeners = new Map(), timers = new Map(), timeouts = new Map();
  const events = target => ({
    addEventListener(type, fn) {const key = `${target}:${type}`; if (!listeners.has(key)) listeners.set(key, new Set()); listeners.get(key).add(fn);},
    removeEventListener(type, fn) {listeners.get(`${target}:${type}`)?.delete(fn);},
  });
  const document = {...events("document"), visibilityState: "visible"};
  const fire = (target, type, event = {}) => [...(listeners.get(`${target}:${type}`) || [])].forEach(fn => fn(event));
  const useState = initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], value => {slots[index] = typeof value === "function" ? value(slots[index]) : value;}];
  };
  const useEffect = (effect, deps) => {
    const index = cursor++;
    const prior = effects.get(index);
    if (!prior || deps.some((value, i) => !Object.is(value, prior.deps[i]))) {
      queued.push(() => {prior?.cleanup?.(); effects.set(index, {deps, cleanup: effect()});});
    }
  };
  const scope = {
    useState, useEffect, useRef: value => useState(() => ({current: value}))[0],
    authToken: "fixture-account-a", AbortController, performance,
    document, window: {...events("window"), dispatchEvent() {},
      setInterval(fn, duration) {timers.set(++timerId, {fn, duration}); return timerId;},
      clearInterval(id) {timers.delete(id);},
      setTimeout(fn, duration) {timeouts.set(++timerId, {fn, duration}); return timerId;},
      clearTimeout(id) {timeouts.delete(id);}}, CustomEvent: class {},
    watchVisibleMasterRefresh: (refresh, environment) => watchVisibleMasterRefresh(refresh, {...environment, now: () => now}), readApiJson,
    watchRequestRefresh: (refresh, environment) => watchRequestRefresh(refresh, {...environment, now: () => now}),
    fetch: (url, options) => new Promise((resolve, reject) => requests.push({
      url, options, reject,
      respond(data, ok = true, status = ok ? 200 : 503) {resolve({ok, status, json: async () => data, text: async () => JSON.stringify(data)});},
    })),
  };
  const api = new Function(...Object.keys(scope), `${hookName === "useMasterRecords" ? hook : dashboardHook}; return {run: ${hookName}, setToken(value) {authToken = value;}};`)(...Object.values(scope));
  return {
    requests, timers, timeouts, listeners, setToken: api.setToken,
    focus() {fire("window", "focus");},
    storage() {fire("window", "storage", {key: REQUEST_CHANGE_STORAGE_KEY, newValue: "invalidation-only"});},
    visibility(value) {document.visibilityState = value; fire("document", "visibilitychange");},
    tick(milliseconds = 60_000) {now += milliseconds; [...timers.values()].forEach(({fn}) => fn());},
    render(name = "Equipment master") {cursor = 0; return api.run(name);},
    effects() {queued.splice(0).forEach(effect => effect());},
    unmount() {for (const effect of effects.values()) effect.cleanup?.();},
  };
}

test("refresh replaces a successful empty equipment result with newly added master records", async () => {
  const app = harness();
  app.render(); app.effects();
  app.requests[0].respond({"Equipment master": []}); await settle();
  let result = app.render();
  assert.equal(result[2], true);
  assert.deepEqual(result[0], []);
  result[7](); app.render(); app.effects();
  assert.equal(app.requests.length, 2);
  assert.equal(app.requests[1].options.cache, "no-store");
  app.requests[1].respond({"Equipment master": newEquipment}); await settle();
  result = app.render();
  assert.deepEqual(result[0], newEquipment);
  assert.equal(result[2], true);
});

for (const hookName of ["useMasterRecords", "useDashboardEquipment"]) test(`${hookName}: mounted role views refresh on focus/visibility and their live polling interval, never while hidden`, async () => {
  const app = harness(hookName);
  const fleetScope = {restrictToScope: true, allowedSites: ["Sasti OB"], allowedRegions: null};
  const response = records => hookName === "useMasterRecords" ? {"Equipment master": records} : {records, scope: fleetScope};
  const records = () => hookName === "useMasterRecords" ? app.render()[0] : app.render().records;
  app.render(); app.effects();
  app.requests[0].respond(response(oldEquipment)); await settle();
  app.render();
  assert.deepEqual([...app.timers.values()].map(timer => timer.duration), [hookName === "useMasterRecords" ? 60_000 : 10_000]);
  app.visibility("hidden"); app.focus(); app.tick(); app.render(); app.effects();
  assert.equal(app.requests.length, 1);
  app.visibility("visible"); app.focus(); app.render(); app.effects();
  assert.equal(app.requests.length, 2, "visibility + focus are one refresh");
  assert.deepEqual(records(), oldEquipment, "existing table data remains visible while loading");
  app.requests[1].respond(response(newEquipment)); await settle();
  assert.deepEqual(records(), newEquipment);
  app.tick(); app.render(); app.effects();
  assert.equal(app.requests.length, 3);
  app.requests[2].reject(new Error("Temporary network error")); await settle();
  assert.deepEqual(records(), newEquipment);
  if (hookName === "useMasterRecords") assert.equal(app.render()[2], true);
  else {
    assert.equal(app.render().loaded, true, "a failed refresh retains the last confirmed snapshot with a reconnecting error");
    assert.equal(app.render().loadError, "Temporary network error");
  }
  app.unmount();
  assert.equal(app.timers.size, 0);
  assert.equal(app.timeouts.size, 0);
  assert.equal([...app.listeners.values()].reduce((sum, set) => sum + set.size, 0), 0);
  app.focus(); app.visibility("visible"); app.tick(); app.render(); app.effects();
  assert.equal(app.requests.length, 3);
});

test("dashboard refresh never leaks previous account fleet data or scope", async () => {
  const app = harness("useDashboardEquipment");
  const fleetScope = {restrictToScope: true, allowedSites: ["Sasti OB"], allowedRegions: null};
  app.render(); app.effects();
  app.requests[0].respond({records: oldEquipment, scope: fleetScope}); await settle();
  app.render().retry(); app.render(); app.effects();
  app.setToken("fixture-account-b"); app.render(); app.effects();
  assert.equal(app.requests[1].options.signal.aborted, true);
  assert.deepEqual(app.render().records, []);
  assert.equal(app.render().scope, null);
  assert.equal(app.render().loaded, false);
  app.requests[1].respond({records: newEquipment, scope: fleetScope}); await settle();
  app.requests[2].reject(new Error("No connection")); await settle();
  assert.deepEqual(app.render().records, []);
  assert.equal(app.render().scope, null);
  assert.equal(app.render().loaded, false);
  app.unmount();
});

test("cross-tab closure refreshes a same-size fleet snapshot and failure recovers on the next poll", async () => {
  const app = harness("useDashboardEquipment");
  const scope = {restrictToScope: true, allowedSites: ["Majri OB"], allowedRegions: []};
  const offroad = [{id: 1, door: "D-01", dashboardRoadStatus: "offroad"}];
  const onroad = [{...offroad[0], dashboardRoadStatus: "onroad"}];
  app.render(); app.effects();
  app.requests[0].respond({records: offroad, scope}); await settle();
  app.storage();
  assert.equal(app.requests.length, 2);
  app.requests[1].respond({records: onroad, scope}); await settle();
  assert.deepEqual(app.render().records, onroad);
  app.tick(10_000);
  app.requests[2].reject(new Error("Temporary network error")); await settle();
  assert.equal(app.render().loaded, true);
  assert.equal(app.render().loadError, "Temporary network error");
  app.tick(10_000);
  app.requests[3].respond({records: onroad, scope}); await settle();
  assert.equal(app.render().loaded, true);
  assert.equal(app.render().loadError, "");
  app.unmount();
  assert.equal(app.timers.size, 0);
  assert.equal(app.timeouts.size, 0);
});

test("fleet refresh retains its timestamp through errors and retries until success", async () => {
  const app = harness("useDashboardEquipment");
  const scope = {restrictToScope: true, allowedSites: ["Majri OB"], allowedRegions: []};
  app.render(); app.effects();
  app.requests[0].respond({records: oldEquipment, scope}); await settle();
  const checked = app.render().updatedAt;
  assert.ok(checked > 0);
  app.tick(10_000);
  app.requests[1].reject(new Error("Offline")); await settle();
  assert.equal(app.render().updatedAt, checked);
  assert.deepEqual(app.render().records, oldEquipment);
  app.render().retry(); app.render(); app.effects();
  assert.equal(app.render().loaded, true);
  assert.equal(app.render().loadError, "Offline", "retry alone must not restore Live");
  app.requests[2].respond({records: newEquipment, scope}); await settle();
  assert.equal(app.render().loadError, "");
  assert.ok(app.render().updatedAt >= checked);
  app.unmount();
});

for (const status of [401, 403]) test(`fleet HTTP ${status} clears cached records and scope`, async () => {
  const app = harness("useDashboardEquipment");
  app.render(); app.effects();
  app.requests[0].respond({records: oldEquipment, scope: {restrictToScope: true, allowedSites: ["Majri OB"], allowedRegions: []}}); await settle();
  app.tick(10_000);
  app.requests[1].respond("not JSON", false, status); await settle();
  assert.equal(app.render().loaded, false);
  assert.equal(app.render().updatedAt, 0);
  assert.deepEqual(app.render().records, []);
  assert.equal(app.render().scope, null);
  app.unmount();
});

test("initial fleet failure has no snapshot and is not fabricated as a zero fleet", async () => {
  const app = harness("useDashboardEquipment");
  app.render(); app.effects();
  app.requests[0].reject(new Error("Offline")); await settle();
  assert.equal(app.render().loaded, false);
  assert.equal(app.render().updatedAt, 0);
  assert.equal(app.render().loadError, "Offline");
  app.unmount();
});

test("failed or malformed refresh retains last successful same-account records and loaded state", async () => {
  const app = harness();
  app.render(); app.effects();
  app.requests[0].respond({"Equipment master": oldEquipment}); await settle();
  app.render()[7](); app.render(); app.effects();
  assert.deepEqual(app.render()[0], oldEquipment);
  assert.equal(app.render()[2], true);
  app.requests[1].reject(new Error("Connection interrupted")); await settle();
  assert.deepEqual(app.render()[0], oldEquipment);
  assert.equal(app.render()[2], true);
  assert.equal(app.render()[6], "Connection interrupted");
  app.render()[7](); app.render(); app.effects();
  app.requests[2].respond({"Equipment master": "not an array"}); await settle();
  assert.deepEqual(app.render()[0], oldEquipment);
  assert.equal(app.render()[2], true);
  assert.match(app.render()[6], /Could not load/);
});

test("repeated refresh aborts and ignores older in-flight responses", async () => {
  const app = harness();
  app.render(); app.effects();
  app.render()[7](); app.render(); app.effects();
  assert.equal(app.requests[0].options.signal.aborted, true);
  app.requests[1].respond({"Equipment master": newEquipment}); await settle();
  app.requests[0].respond({"Equipment master": oldEquipment}); await settle();
  assert.deepEqual(app.render()[0], newEquipment);
  assert.equal(app.render()[6], "");
});

test("account changes abort old-scope refresh and never retain another account's records", async () => {
  const app = harness();
  app.render(); app.effects();
  app.requests[0].respond({"Equipment master": oldEquipment}); await settle();
  app.render()[7](); app.render(); app.effects();
  app.setToken("fixture-account-b"); app.render(); app.effects();
  assert.equal(app.requests[1].options.signal.aborted, true);
  assert.equal(app.requests[2].options.headers.Authorization, "Bearer fixture-account-b");
  assert.deepEqual(app.render()[0], []);
  assert.equal(app.render()[2], false);
  app.requests[1].respond({"Equipment master": newEquipment}); await settle();
  assert.deepEqual(app.render()[0], []);
  app.requests[2].reject(new Error("No connection")); await settle();
  assert.deepEqual(app.render()[0], []);
  assert.equal(app.render()[2], false);
});

test("master-name changes abort old requests and unmount cancels the current request", async () => {
  const app = harness();
  app.render(); app.effects();
  app.render("Repair type master"); app.effects();
  assert.equal(app.requests[0].options.signal.aborted, true);
  app.requests[0].respond({"Equipment master": oldEquipment}); await settle();
  assert.deepEqual(app.render("Repair type master")[0], []);
  app.unmount();
  assert.equal(app.requests[1].options.signal.aborted, true);
});
