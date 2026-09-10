import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {transformWithOxc} from "vite";
import {createDashboardRequestLoader} from "../src/dashboard-request-data.mjs";
import {formatDisplayDateTime} from "../date-time-format.mjs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const noticeSource = source.slice(source.indexOf("function ConnectionRecoveryNotice("), source.indexOf("function ManagerDashboard("));
const {code} = await transformWithOxc(noticeSource, "notice.jsx", {jsx: {runtime: "classic"}});
const Notice = new Function("React", "AlertTriangle", "RotateCcw", "formatDisplayDateTime", `${code}; return ConnectionRecoveryNotice;`)(React, () => null, () => null, formatDisplayDateTime);
const response = (data, status = 200) => ({ok: status === 200, status, json: async () => data});

test("reconnecting notice displays the recorded India timestamp, not a live timestamp", () => {
  const updatedAt = Date.parse("2026-09-10T10:00:00Z");
  const html = renderToStaticMarkup(React.createElement(Notice, {updatedAt}));
  assert.match(html, /Reconnecting · Last updated/);
  assert.ok(html.includes("10-09-2026 03:30:00 PM"));
  assert.match(html, /Showing last successfully loaded data. Retrying automatically./);
  assert.match(html, /Retry now/);
  assert.doesNotMatch(html, />Live[ <]/);
});

function adminLoader() {
  let rows = [], state = {token: "account-a", loaded: false, updatedAt: 0, error: ""};
  let result = () => response([]);
  const block = source.slice(source.indexOf("  const loadRequests = async () =>", source.indexOf("function App(")), source.indexOf("  const requestsLoaded =", source.indexOf("function App(")));
  const load = new Function("fetch", "window", "session", "requestLoadSequence", "setRequests", "setRequestState", `${block}; return loadRequests;`)(
    async () => result(), {setTimeout, clearTimeout}, {token: "account-a"}, {current: 0},
    value => {rows = typeof value === "function" ? value(rows) : value;},
    value => {state = typeof value === "function" ? value(state) : value;},
  );
  return {load, reply: next => {result = next;}, state: () => state, rows: () => rows};
}

for (const failure of ["network", "timeout", "503", "invalid"]) test(`admin ${failure} refresh retains previous rows and time and recovers`, async () => {
  const app = adminLoader();
  const rows = [{ref: "EXISTING", status: "Open"}];
  app.reply(() => response(rows)); await app.load();
  const timestamp = app.state().updatedAt;
  app.reply(() => {
    if (failure === "503") return response({error: "Unavailable"}, 503);
    if (failure === "invalid") return response({requests: []});
    throw Object.assign(new Error("Connection interrupted"), {name: failure === "timeout" ? "AbortError" : "TypeError"});
  });
  await assert.rejects(app.load());
  assert.equal(app.state().loaded, true);
  assert.equal(app.state().updatedAt, timestamp);
  assert.ok(app.state().error);
  assert.deepEqual(app.rows(), rows);
  const closed = [{...rows[0], status: "Closed"}];
  app.reply(() => response(closed)); await app.load();
  assert.equal(app.state().error, "");
  assert.deepEqual(app.rows(), closed);
});

for (const status of [401, 403]) test(`admin HTTP ${status} never retains private snapshot`, async () => {
  const app = adminLoader();
  app.reply(() => response([{ref: "PRIVATE"}])); await app.load();
  app.reply(() => response("not JSON", status));
  await assert.rejects(app.load());
  assert.equal(app.state().loaded, false);
  assert.equal(app.state().updatedAt, 0);
  assert.deepEqual(app.rows(), []);
});

test("initial admin failure remains unavailable, while a successful empty list is a valid snapshot", async () => {
  const app = adminLoader();
  app.reply(() => response(null, 503)); await assert.rejects(app.load());
  assert.equal(app.state().loaded, false);
  assert.equal(app.state().updatedAt, 0);
  app.reply(() => response([])); await app.load();
  app.reply(() => response(null, 503)); await assert.rejects(app.load());
  assert.equal(app.state().loaded, true);
  assert.deepEqual(app.rows(), []);
});

test("mobile retry remains reconnecting until the next response actually succeeds", async () => {
  let result = response([{ref: "OLD"}]), timestamp = 10, finish;
  const loader = createDashboardRequestLoader({fetchImpl: async () => result, now: () => timestamp});
  await loader.load("account-a");
  result = response({}, 503); await loader.load("account-a");
  result = new Promise(resolve => {finish = resolve;});
  const retry = loader.load("account-a");
  assert.ok(loader.getState().error);
  assert.equal(loader.getState().updatedAt, 10);
  assert.equal(loader.getState().loaded, true);
  timestamp = 20; finish(response([{ref: "NEW"}])); await retry;
  assert.equal(loader.getState().error, "");
  assert.equal(loader.getState().updatedAt, 20);
  assert.deepEqual(loader.getState().records, [{ref: "NEW"}]);
});

test("admin and production/maintenance/MIS dashboard gates retain only same-session successful data", () => {
  assert.match(source, /requestsLoaded \? <Dashboard/);
  assert.match(source, /requestState.token === session\?\.token && requestState.loaded/);
  assert.match(source, /dashboardState.token === session\?\.token && dashboardState.loaded\)/);
  assert.match(source, /requestsError=\{dashboardState.error\} requestsUpdatedAt=\{dashboardState.updatedAt\}/);
});
