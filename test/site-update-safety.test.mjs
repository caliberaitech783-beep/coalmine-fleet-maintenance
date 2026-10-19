import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { transformWithOxc } from "vite";
import { createSiteUpdateSafety, requestWriteKey, SITE_UPDATE_SETTLE_MS } from "../src/site-update-safety.mjs";
import { isNetworkFailure, isTransientStatus } from "../src/api-transient-retry.mjs";
import { requestWriteOutcomeConfirmed, requestWriteConnectionMessage } from "../src/request-write-recovery.mjs";

const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const countdownStart = main.indexOf("function SiteUpdateCountdown()");
const countdownEnd = main.indexOf("createRoot(document.getElementById", countdownStart);
assert.ok(countdownStart >= 0 && countdownEnd > countdownStart);
const { code: countdownCode } = await transformWithOxc(main.slice(countdownStart, countdownEnd), "SiteUpdateCountdown.jsx", { jsx: { runtime: "classic" } });
const flush = () => new Promise((resolve) => setImmediate(resolve));

function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, predicate));
  if (!React.isValidElement(tree)) return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props.children, predicate)];
}
const text = (tree) => Array.isArray(tree) ? tree.map(text).join("") : React.isValidElement(tree) ? text(tree.props.children) : String(tree ?? "");

function countdownHarness() {
  let now = 0, cursor = 0, dirty = false, timerId = 0, versionChecks = 0, confirmed = true;
  const slots = [], effects = [], intervals = new Map(), listeners = new Map(), navigations = [];
  const safety = createSiteUpdateSafety({ now: () => now, origin: "https://pulse.cmll.in" });
  const savedLogin = JSON.stringify({ token: "test-session", role: "normal" });
  const localValues = new Map([["nerveCenterSession", savedLogin]]);
  const tabValues = new Map([["nerveCenterSession", savedLogin]]);
  const storage = (values) => ({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key), clear: () => values.clear() });
  const bindings = {
    React, Date: { now: () => now }, APP_VERSION: "previous-version", siteUpdateSafety: safety,
    adaptiveRefreshInterval: (_window, ms) => ms,
    useState(initial) {
      const at = cursor++;
      if (!(at in slots)) slots[at] = typeof initial === "function" ? initial() : initial;
      return [slots[at], (next) => { const value = typeof next === "function" ? next(slots[at]) : next; if (!Object.is(value, slots[at])) { slots[at] = value; dirty = true; } }];
    },
    useRef(initial) { const at = cursor++; return slots[at] ||= { current: initial }; },
    useEffect(callback, dependencies) {
      const at = cursor++, old = slots[at];
      if (!old || dependencies.some((value, index) => !Object.is(value, old.dependencies[index]))) {
        slots[at] = { dependencies };
        effects.push(() => { old?.cleanup?.(); slots[at].cleanup = callback(); });
      }
    },
    fetch: async () => { versionChecks += 1; return { ok: true, json: async () => ({ version: "new-version" }) }; },
    localStorage: storage(localValues), sessionStorage: storage(tabValues),
    window: {
      location: { replace: (url) => navigations.push(url) }, confirm: () => confirmed,
      setInterval(callback) { intervals.set(++timerId, callback); return timerId; }, clearInterval: (id) => intervals.delete(id),
      addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
      removeEventListener(name, callback) { listeners.get(name)?.delete(callback); },
    },
  };
  bindings.window.localStorage = bindings.localStorage;
  bindings.window.sessionStorage = bindings.sessionStorage;
  const Component = new Function(...Object.keys(bindings), `${countdownCode};return SiteUpdateCountdown;`)(...Object.values(bindings));
  return {
    safety, navigations, intervals, listeners,
    render() { let tree, attempts = 0; do { dirty = false; cursor = 0; tree = Component(); effects.splice(0).forEach((run) => run()); assert.ok(++attempts < 20, "stable countdown render"); } while (dirty); return tree; },
    advance(ms) { now += ms; [...intervals.values()].forEach((callback) => callback()); },
    focus() { [...listeners.get("focus") || []].forEach((callback) => callback()); },
    confirm(value) { confirmed = value; },
    assertSessionPreserved() { assert.equal(localValues.get("nerveCenterSession"), savedLogin); assert.equal(tabValues.get("nerveCenterSession"), savedLogin); },
    get versionChecks() { return versionChecks; },
    dispose() { slots.forEach((slot) => slot?.cleanup?.()); },
  };
}

function clock() {
  let at = 0;
  return { safety: createSiteUpdateSafety({ now: () => at, origin: "https://pulse.cmll.in" }), set: (value) => { at = value; } };
}

test("request mutation tracking excludes polling, telemetry and other applications", () => {
  const origin = "https://pulse.cmll.in";
  assert.equal(requestWriteKey("/api/requests/R1/close?retry=1", { method: "PATCH" }, origin), "PATCH /api/requests/R1/close");
  assert.equal(requestWriteKey(new Request(`${origin}/api/requests`, { method: "POST" }), undefined, origin), "POST /api/requests");
  assert.equal(requestWriteKey(new URL(`${origin}/api/requests/R1`), { method: "delete" }, origin), "DELETE /api/requests/R1");
  for (const [url, method] of [
    ["/api/requests", "GET"], ["/api/requests", "HEAD"], ["/api/requests", "OPTIONS"],
    ["/api/session-heartbeat", "POST"], ["/api/user-activity", "POST"], ["/api/app-version", "POST"],
    ["/api/remote-assistance/1/events", "POST"], ["/api/preferred-language", "POST"],
    ["/api/requests-other", "POST"], ["https://other.example/api/requests", "POST"],
  ]) assert.equal(requestWriteKey(url, { method }, origin), "", `${method} ${url}`);
  assert.equal(requestWriteKey(new Request(`${origin}/api/requests`, { method: "POST" }), { method: "GET" }, origin), "");
});

test("an expired countdown waits for every overlapping save and the final settling grace", () => {
  const { safety, set } = clock();
  assert.equal(safety.getState(60000).canRefresh, false);
  set(59000);
  const first = safety.beginApiWrite("/api/requests/R1/close", { method: "PATCH" });
  const second = safety.beginApiWrite("/api/requests/R2/verify", { method: "PATCH" });
  set(60000);
  assert.equal(safety.getState(60000).pendingCount, 2);
  assert.equal(safety.getState(60000).reason, "saving");
  first({ ok: true });
  set(64000);
  assert.equal(safety.getState(60000).canRefresh, false, "the second operation still owns a lease");
  second({ ok: true });
  assert.equal(safety.getState(60000).reason, "settling");
  set(64000 + SITE_UPDATE_SETTLE_MS - 1);
  assert.equal(safety.getState(60000).canRefresh, false);
  set(64000 + SITE_UPDATE_SETTLE_MS);
  assert.equal(safety.getState(60000).canRefresh, true);
  assert.equal(first({ ok: false }), false, "an already released lease cannot introduce a failure");
  assert.equal(safety.getState(60000).failedCount, 0);
});

test("an explicit workflow lease protects parsing, recovery and UI work after the network resolves", () => {
  const { safety, set } = clock();
  const workflow = safety.beginWrite();
  const network = safety.beginApiWrite("/api/requests/R1/close", { method: "PATCH" });
  network({ ok: true });
  set(10000);
  assert.equal(safety.getState(1000).canRefresh, false, "slow parsing or UI work is still protected");
  workflow({ ok: true });
  set(12000);
  assert.equal(safety.getState(1000).canRefresh, true);
});

test("a failed or uncertain save remains protected until explicit acknowledgement", () => {
  const { safety, set } = clock();
  const failed = safety.beginApiWrite("/api/requests/R1/close", { method: "PATCH" });
  failed();
  assert.equal(safety.getState(0).reason, "save-failed");
  assert.equal(safety.acknowledgeFailures(), false, "acknowledgement cannot bypass settling");
  set(3000);
  const retry = safety.beginApiWrite("/api/requests/R1/close", { method: "PATCH" });
  assert.equal(safety.acknowledgeFailures(), false, "acknowledgement cannot bypass a pending retry");
  retry({ ok: true });
  set(60000);
  assert.equal(safety.getState(0).canRefresh, false, "a successful retry must not silently clear an uncertain save");
  assert.equal(safety.getState(0).canRefreshNow, true, "an explicit refresh can now be offered");
  assert.equal(safety.getState(0).failedCount, 1);
  assert.equal(safety.acknowledgeFailures(), true);
  assert.equal(safety.getState(0).canRefresh, true);
});

test("ignored background failures neither delay refresh nor create recovery holds", () => {
  const { safety } = clock();
  const heartbeat = safety.beginApiWrite("/api/session-heartbeat", { method: "POST" });
  heartbeat({ ok: false });
  assert.equal(safety.getState(0).canRefresh, true);
  assert.equal(safety.getState(0).pendingCount, 0);
  assert.equal(safety.getState(0).failedCount, 0);
});

test("the guard decides when to refresh without reading, clearing or changing a login session", (t) => {
  let storageTouches = 0;
  for (const name of ["localStorage", "sessionStorage"]) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, get() { storageTouches += 1; throw new Error("Login storage must not be accessed"); } });
    t.after(() => { if (previous) Object.defineProperty(globalThis, name, previous); else delete globalThis[name]; });
  }
  const { safety, set } = clock();
  const finish = safety.beginApiWrite("/api/requests/R1/close", { method: "PATCH" });
  finish({ ok: false });
  set(5000);
  safety.acknowledgeFailures();
  assert.equal(safety.getState(0).canRefresh, true);
  assert.equal(storageTouches, 0);
});

test("the actual update banner waits the full minute, reloads once and preserves login storage", async (t) => {
  const view = countdownHarness();
  t.after(() => view.dispose());
  assert.equal(view.render(), null);
  await flush();
  assert.match(text(view.render()), /1:00/);
  view.advance(59999);
  assert.match(text(view.render()), /0:01/);
  assert.equal(view.navigations.length, 0);
  view.advance(1);
  view.render();
  assert.deepEqual(view.navigations, ["/?updated=new-version"]);
  view.advance(5000);
  view.focus();
  await flush();
  view.render();
  assert.equal(view.navigations.length, 1);
  assert.equal(view.versionChecks, 1, "a scheduled update is not restarted by focus or polling");
  view.assertSessionPreserved();
  view.dispose();
  assert.equal(view.intervals.size, 0);
  assert.ok([...view.listeners.values()].every((callbacks) => callbacks.size === 0));
});

test("the actual update banner pauses an expired countdown until save and parsing leases settle", async (t) => {
  const view = countdownHarness();
  t.after(() => view.dispose());
  view.render();
  await flush();
  view.render();
  view.advance(59000);
  const network = view.safety.beginApiWrite("/api/requests/R1/close", { method: "PATCH" });
  const parsing = view.safety.beginWrite();
  view.advance(1000);
  assert.match(text(view.render()), /refresh paused/);
  assert.equal(view.navigations.length, 0);
  network({ ok: true });
  view.advance(3000);
  view.render();
  assert.equal(view.navigations.length, 0, "the workflow remains protected after the HTTP response");
  parsing({ ok: true });
  view.advance(SITE_UPDATE_SETTLE_MS - 1);
  view.render();
  assert.equal(view.navigations.length, 0);
  view.advance(1);
  view.render();
  assert.equal(view.navigations.length, 1);
  view.advance(1000);
  view.render();
  assert.equal(view.navigations.length, 1);
  view.assertSessionPreserved();
});

test("the actual update banner holds failed saves until the user checks and confirms refresh", async (t) => {
  const view = countdownHarness();
  t.after(() => view.dispose());
  view.render();
  await flush();
  view.render();
  view.advance(59000);
  const finish = view.safety.beginApiWrite("/api/requests/R1/close", { method: "PATCH" });
  finish({ ok: false });
  view.advance(1000);
  let tree = view.render();
  assert.match(text(tree), /A save needs checking/);
  let button = nodes(tree, (node) => node.type === "button")[0];
  assert.ok(button.props.disabled, "the review action cannot bypass settling");
  button.props.onClick();
  assert.equal(view.navigations.length, 0);
  view.advance(120000);
  tree = view.render();
  assert.equal(view.navigations.length, 0, "time alone does not resolve an uncertain save");
  button = nodes(tree, (node) => node.type === "button")[0];
  assert.equal(button.props.disabled, false);
  view.confirm(false);
  button.props.onClick();
  assert.equal(view.navigations.length, 0);
  assert.equal(view.safety.getState(0).failedCount, 1);
  view.confirm(true);
  button.props.onClick();
  assert.deepEqual(view.navigations, ["/?updated=new-version"]);
  view.advance(1000);
  view.render();
  assert.equal(view.navigations.length, 1);
  view.assertSessionPreserved();
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function requestOperation(name, nextName, safety, overrides = {}) {
  const start = main.indexOf(`    ${name} =`);
  const end = main.indexOf(`    ${nextName} =`, start);
  assert.ok(start >= 0 && end > start, `find ${name} operation`);
  const expression = main.slice(start, end).trim().replace(new RegExp(`^${name}\\s*=\\s*`), "").replace(/,\s*$/, "");
  const rows = [{ ref: "R1", status: "Open", start: "2026-10-19 10:00:00" }];
  const observed = { rows, published: 0, pendingWhenPublished: 0 };
  const bindings = {
    siteUpdateSafety: safety, session: { token: "test-session" }, authToken: "", requestLoadSequence: { current: 0 },
    requests: rows, window: {},
    setRequests(update) { observed.rows = update(observed.rows); observed.pendingWhenPublished = safety.getState(0).pendingCount; },
    notifyRequestChange() { observed.published += 1; },
    isNetworkFailure, isTransientStatus, requestWriteOutcomeConfirmed, requestWriteConnectionMessage,
    ...overrides,
  };
  return { run: new Function(...Object.keys(bindings), `return (${expression});`)(...Object.values(bindings)), observed };
}

test("actual addRequest and updateRequest keep their leases through body parsing and state publication", async () => {
  for (const [name, nextName, args, bodyMethod] of [
    ["addRequest", "updateRequest", [{ ref: "R2" }], "json"],
    ["updateRequest", "addDailyRemark", ["R1", { workDone: "Repaired" }, "close"], "text"],
  ]) {
    const { safety, set } = clock();
    const body = deferred();
    const saved = { ref: name === "addRequest" ? "R2" : "R1", status: "Closed" };
    const operation = requestOperation(name, nextName, safety, { fetch: async () => ({ ok: true, [bodyMethod]: () => body.promise }) });
    const result = operation.run(...args);
    await flush();
    set(60000);
    assert.equal(safety.getState(0).pendingCount, 1, `${name} is still reading the response`);
    assert.equal(safety.getState(0).canRefresh, false);
    body.resolve(bodyMethod === "text" ? JSON.stringify(saved) : saved);
    assert.deepEqual(await result, saved);
    assert.equal(operation.observed.pendingWhenPublished, 1, `${name} publishes state before releasing its lease`);
    assert.equal(operation.observed.published, 1);
    assert.equal(safety.getState(0).reason, "settling");
    set(62000);
    assert.equal(safety.getState(0).canRefresh, true);
  }
});

test("actual updateRequest holds its lease through uncertain-write recovery and retains unresolved failures", async () => {
  for (const recovered of [true, false]) {
    const { safety, set } = clock();
    const recovery = deferred();
    const saved = { ref: "R1", status: "Closed", closedAt: "2026-10-19 13:10:00", workDone: "Repaired" };
    const operation = requestOperation("updateRequest", "addDailyRemark", safety, {
      fetch: async () => { throw new TypeError("Failed to fetch"); },
      loadRequests: () => recovery.promise,
    });
    const result = operation.run("R1", { workDone: "Repaired" }, "close");
    const rejected = recovered ? null : assert.rejects(result, /connection|confirmed|saved|check/i);
    await flush();
    set(60000);
    assert.equal(safety.getState(0).pendingCount, 1);
    assert.equal(safety.getState(0).canRefresh, false);
    recovery.resolve(recovered ? [saved] : []);
    if (recovered) assert.deepEqual(await result, saved);
    else await rejected;
    set(62000);
    assert.equal(safety.getState(0).pendingCount, 0);
    assert.equal(safety.getState(0).canRefresh, recovered);
    assert.equal(safety.getState(0).failedCount, recovered ? 0 : 1);
  }
});
