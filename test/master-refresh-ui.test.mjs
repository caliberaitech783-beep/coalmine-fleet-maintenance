import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { watchVisibleMasterRefresh } from "../src/master-refresh.mjs";
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
  const listeners = new Map(), timers = new Map();
  const events = target => ({
    addEventListener(type, fn) {const key = `${target}:${type}`; if (!listeners.has(key)) listeners.set(key, new Set()); listeners.get(key).add(fn);},
    removeEventListener(type, fn) {listeners.get(`${target}:${type}`)?.delete(fn);},
  });
  const document = {...events("document"), visibilityState: "visible"};
  const fire = (target, type) => [...(listeners.get(`${target}:${type}`) || [])].forEach(fn => fn());
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
      clearInterval(id) {timers.delete(id);}}, CustomEvent: class {},
    watchVisibleMasterRefresh: (refresh, environment) => watchVisibleMasterRefresh(refresh, {...environment, now: () => now}), readApiJson,
    fetch: (url, options) => new Promise((resolve, reject) => requests.push({
      url, options, reject,
      respond(data, ok = true) {resolve({ok, json: async () => data, text: async () => JSON.stringify(data)});},
    })),
  };
  const api = new Function(...Object.keys(scope), `${hookName === "useMasterRecords" ? hook : dashboardHook}; return {run: ${hookName}, setToken(value) {authToken = value;}};`)(...Object.values(scope));
  return {
    requests, timers, listeners, setToken: api.setToken,
    focus() {fire("window", "focus");},
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

for (const hookName of ["useMasterRecords", "useDashboardEquipment"]) test(`${hookName}: all mounted role views refresh on focus/visibility and once a minute, never while hidden`, async () => {
  const app = harness(hookName);
  const fleetScope = {restrictToScope: true, allowedSites: ["Sasti OB"], allowedRegions: null};
  const response = records => hookName === "useMasterRecords" ? {"Equipment master": records} : {records, scope: fleetScope};
  const records = () => hookName === "useMasterRecords" ? app.render()[0] : app.render().records;
  app.render(); app.effects();
  app.requests[0].respond(response(oldEquipment)); await settle();
  app.render();
  assert.deepEqual([...app.timers.values()].map(timer => timer.duration), [60_000]);
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
  assert.equal(hookName === "useMasterRecords" ? app.render()[2] : app.render().loaded, true);
  app.unmount();
  assert.equal(app.timers.size, 0);
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
