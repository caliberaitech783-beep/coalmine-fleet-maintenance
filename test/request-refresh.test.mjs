import test from "node:test";
import assert from "node:assert/strict";
import {notifyRequestChange, REQUEST_CHANGE_STORAGE_KEY, watchRequestRefresh} from "../src/request-refresh.mjs";

function surface() {
  const listeners = new Map();
  return {
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    },
    removeEventListener(name, listener) { listeners.get(name)?.delete(listener); },
    emit(name, event = {}) { for (const listener of listeners.get(name) || []) listener(event); },
    listenerCount() { return [...listeners.values()].reduce((sum, set) => sum + set.size, 0); },
  };
}

function browser() {
  let currentTime = 0;
  let nextTimer = 0;
  const timers = new Map();
  const writes = [];
  const doc = {...surface(), visibilityState: "visible"};
  const win = {
    ...surface(), document: doc,
    localStorage: {setItem: (...args) => writes.push(args)},
    setInterval(callback, delay) { const id = ++nextTimer; timers.set(id, {callback, delay}); return id; },
    clearInterval(id) { timers.delete(id); },
  };
  return {
    win, doc, timers, writes,
    options: {win, doc, now: () => currentTime},
    advance(ms = 1_001) { currentTime += ms; },
    poll() { for (const {callback} of timers.values()) callback(); },
  };
}

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return {promise, resolve, reject};
}

test("request refresh polls every ten seconds only while visible and cleans up all listeners", async () => {
  const b = browser();
  let calls = 0;
  const stop = watchRequestRefresh(() => { calls++; }, b.options);
  assert.equal(calls, 0, "the existing initial load is not duplicated");
  assert.equal([...b.timers.values()][0].delay, 10_000);
  b.poll();
  await flush();
  assert.equal(calls, 1);
  b.doc.visibilityState = "hidden";
  b.poll(); b.win.emit("focus"); b.doc.emit("visibilitychange");
  assert.equal(calls, 1);
  b.doc.visibilityState = "visible";
  b.doc.emit("visibilitychange");
  await flush();
  assert.equal(calls, 2);
  stop(); stop();
  assert.equal(b.win.listenerCount(), 0);
  assert.equal(b.doc.listenerCount(), 0);
  assert.equal(b.timers.size, 0);
  b.poll(); b.win.emit("focus");
  assert.equal(calls, 2);
});

test("return-to-tab events refresh immediately but their event burst is deduplicated", async () => {
  const b = browser();
  let calls = 0;
  const stop = watchRequestRefresh(() => { calls++; }, b.options);
  b.win.emit("focus"); b.doc.emit("visibilitychange"); b.win.emit("pageshow");
  await flush();
  assert.equal(calls, 1);
  b.advance(); b.win.emit("online");
  await flush();
  b.advance(); b.win.emit("pageshow");
  await flush();
  assert.equal(calls, 3);
  stop();
});

test("overlapping polling and mutation invalidations coalesce into one serial follow-up", async () => {
  const b = browser();
  const loads = [];
  let active = 0, maximumActive = 0;
  const stop = watchRequestRefresh(async () => {
    active++; maximumActive = Math.max(maximumActive, active);
    const load = deferred(); loads.push(load);
    await load.promise;
    active--;
  }, {...b.options, initial: true});
  assert.equal(loads.length, 1);
  b.poll(); b.poll();
  b.win.emit("storage", {key: REQUEST_CHANGE_STORAGE_KEY, newValue: "invalidation-1"});
  b.win.emit("storage", {key: REQUEST_CHANGE_STORAGE_KEY, newValue: "invalidation-2"});
  assert.equal(loads.length, 1);
  loads[0].resolve(); await flush();
  assert.equal(loads.length, 2);
  loads[1].resolve(); await flush();
  assert.equal(loads.length, 2);
  assert.equal(maximumActive, 1);
  stop();
});

test("a real hidden-to-visible return is not swallowed by the previous event burst", async () => {
  const b = browser();
  let calls = 0;
  const stop = watchRequestRefresh(() => { calls++; }, b.options);
  b.win.emit("focus"); await flush();
  b.doc.visibilityState = "hidden";
  b.doc.emit("visibilitychange");
  b.doc.visibilityState = "visible";
  b.doc.emit("visibilitychange"); b.win.emit("focus");
  await flush();
  assert.equal(calls, 2);
  stop();
});

test("refresh continues after a rejected request and a throwing error callback", async () => {
  const b = browser();
  const errors = [];
  let calls = 0;
  const stop = watchRequestRefresh(() => {
    calls++;
    if (calls === 1) return Promise.reject(new Error("Temporary connection failure"));
    if (calls === 2) throw new Error("Temporary synchronous failure");
  }, {...b.options, initial: true, onError(error) { errors.push(error.message); throw new Error("Ignored reporter error"); }});
  await flush();
  b.poll(); await flush();
  b.poll(); await flush();
  assert.equal(calls, 3);
  assert.equal(errors.length, 2);
  stop();
});

test("cleanup prevents an in-flight request from starting its queued follow-up", async () => {
  const b = browser();
  const load = deferred();
  let calls = 0;
  const stop = watchRequestRefresh(() => { calls++; return load.promise; }, {...b.options, initial: true});
  b.poll();
  stop();
  load.resolve(); await flush();
  assert.equal(calls, 1);
});

test("only request storage invalidations trigger refresh and hidden tabs wait until visible", async () => {
  const b = browser();
  let calls = 0;
  const stop = watchRequestRefresh(() => { calls++; }, b.options);
  for (const event of [{key: "another-key", newValue: "x"}, {key: REQUEST_CHANGE_STORAGE_KEY, newValue: null}, {key: null}]) b.win.emit("storage", event);
  assert.equal(calls, 0);
  b.doc.visibilityState = "hidden";
  b.win.emit("storage", {key: REQUEST_CHANGE_STORAGE_KEY, newValue: "new-change"});
  assert.equal(calls, 0);
  b.doc.visibilityState = "visible";
  b.doc.emit("visibilitychange");
  await flush();
  assert.equal(calls, 1);
  b.win.emit("storage", {key: REQUEST_CHANGE_STORAGE_KEY, newValue: "second-change"});
  await flush();
  assert.equal(calls, 2, "a mutation is not suppressed by the resume debounce");
  stop();
});

test("a queued refresh stays paused if the tab becomes hidden before a fetch settles", async () => {
  const b = browser();
  const load = deferred();
  let calls = 0;
  const stop = watchRequestRefresh(() => { calls++; return calls === 1 ? load.promise : undefined; }, {...b.options, initial: true});
  b.poll();
  b.doc.visibilityState = "hidden";
  load.resolve(); await flush();
  assert.equal(calls, 1);
  b.doc.visibilityState = "visible";
  b.doc.emit("visibilitychange"); await flush();
  assert.equal(calls, 2);
  stop();
});

test("cross-tab notification contains only an invalidation token and handles unavailable storage", () => {
  const b = browser();
  assert.equal(notifyRequestChange(b.win), true);
  assert.equal(notifyRequestChange(b.win), true);
  assert.equal(b.writes.length, 2);
  for (const [key, value] of b.writes) {
    assert.equal(key, REQUEST_CHANGE_STORAGE_KEY);
    assert.match(value, /^\d+:[a-z0-9]+$/);
  }
  assert.notEqual(b.writes[0][1], b.writes[1][1]);
  assert.equal(notifyRequestChange({get localStorage() { throw new Error("Storage unavailable"); }}), false);
  assert.doesNotThrow(() => watchRequestRefresh(() => {}, {win: null, doc: null})());
});
