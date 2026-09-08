import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { transformWithOxc } from "vite";
import { watchVisibleMasterRefresh } from "../src/master-refresh.mjs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const componentSource = source.slice(source.indexOf("function TicketPage("), source.indexOf("const AI_FEEDER_CLOSE_DELAY_SECONDS"));
const code = (await transformWithOxc(componentSource, "TicketPage.jsx", {jsx: {runtime: "classic"}})).code;
const Null = () => null;
const TicketCreateForm = () => null, TicketResolutionForm = () => null, ExportMenu = () => null;
const settle = () => new Promise(resolve => setImmediate(resolve));
const all = (tree, predicate) => {
  const result = [];
  const visit = node => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!React.isValidElement(node)) return;
    if (predicate(node)) result.push(node);
    visit(node.props.children);
  };
  visit(tree);
  return result;
};
const text = node => Array.isArray(node) ? node.map(text).join("") : React.isValidElement(node) ? text(node.props.children) : typeof node === "string" || typeof node === "number" ? String(node) : "";
const button = (tree, label) => all(tree, node => node.type === "button" && text(node).trim() === label)[0];
const rows = tree => all(tree, node => node.type === ExportMenu)[0].props.rows;
const alertText = tree => all(tree, node => node.props.role === "alert").map(text).join(" ");
const production = {token: "qa-production", role: "normal", assignedRole: "Production User"};
const admin = {token: "qa-admin", role: "super", permissions: {adminLevel: "Admin"}};
const ticket = (reference, category = "Production", status = "Open") => ({reference, category, status, creatorName: "QA ONLY", creatorLogin: "qa-only", creatorRole: `${category} User`, site: "QA SITE", message: "Authorised isolated test", priority: "Low"});

function harness(session = production) {
  let cursor = 0, now = 0, timerId = 0;
  const slots = [], effects = new Map(), queued = [], requests = [];
  const listeners = new Map(), timers = new Map();
  const events = target => ({
    addEventListener(type, fn) { const key = `${target}:${type}`; if (!listeners.has(key)) listeners.set(key, new Set()); listeners.get(key).add(fn); },
    removeEventListener(type, fn) { listeners.get(`${target}:${type}`)?.delete(fn); },
  });
  const document = {...events("document"), visibilityState: "visible"};
  const fire = (target, type) => [...(listeners.get(`${target}:${type}`) || [])].forEach(fn => fn());
  const useState = initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
  };
  const useEffect = (effect, deps) => {
    const index = cursor++;
    const prior = effects.get(index);
    if (!prior || deps.some((value, i) => !Object.is(value, prior.deps[i]))) {
      queued.push(() => { prior?.cleanup?.(); effects.set(index, {deps, cleanup: effect()}); });
    }
  };
  const scope = {
    React, useState, useEffect, useRef: value => useState(() => ({current: value}))[0],
    document, window: {...events("window"),
      setInterval(fn, duration) {timers.set(++timerId, {fn, duration}); return timerId;},
      clearInterval(id) {timers.delete(id);}},
    watchVisibleMasterRefresh: (refresh, environment) => watchVisibleMasterRefresh(refresh, {...environment, now: () => now}),
    AbortController, ticketCategories: ["General", "Production", "Maintenance", "MIS", "Equipment", "System access"],
    fetch: (url, options) => new Promise((resolve, reject) => requests.push({url, options, reject,
      respond(data, ok = true) {resolve({ok, json: async () => data});},
      malformed() {resolve({ok: true, json: async () => {throw new Error("Invalid JSON");}});},
    })),
    alert: () => assert.fail("Tickets must not open a native alert"),
    ExportMenu, TicketCreateForm, TicketResolutionForm,
    ActionsTable: Null, Status: Null, TicketAttachment: Null, TicketMedia: Null, Plus: Null,
  };
  const component = new Function(...Object.keys(scope), `${code}; return TicketPage;`)(...Object.values(scope));
  return {
    requests, listeners, timers,
    render(nextSession = session) {session = nextSession; cursor = 0; return component({session});},
    effects() {queued.splice(0).forEach(effect => effect());},
    focus() {fire("window", "focus");},
    visibility(value) {document.visibilityState = value; fire("document", "visibilitychange");},
    tick(milliseconds = 60_000) {now += milliseconds; [...timers.values()].forEach(({fn}) => fn());},
    unmount() {for (const effect of effects.values()) effect.cleanup?.();},
  };
}
const changeCategory = (app, category) => {
  all(app.render(), node => node.type === "select")[0].props.onChange({target: {value: category}});
  const tree = app.render(); app.effects(); return tree;
};
const createdCallback = app => {
  button(app.render(), "Create ticket").props.onClick();
  return all(app.render(), node => node.type === TicketCreateForm)[0].props.onCreated;
};

test("Tickets refresh on focus/visibility and once a minute without blanking rows or polling hidden tabs", async () => {
  const app = harness();
  app.render(); app.effects();
  app.requests[0].respond([ticket("QA-1")]); await settle();
  assert.deepEqual(rows(app.render()).map(row => row.status), ["Open"]);
  assert.deepEqual([...app.timers.values()].map(timer => timer.duration), [60_000]);
  assert.equal(app.requests[0].options.cache, "no-store");
  app.visibility("hidden"); app.focus(); app.tick(); app.render(); app.effects();
  assert.equal(app.requests.length, 1);
  app.visibility("visible"); app.focus(); app.render(); app.effects();
  assert.equal(app.requests.length, 2, "visibility + focus are coalesced");
  assert.equal(rows(app.render())[0].status, "Open", "last-good rows remain while refreshing");
  app.requests[1].respond([ticket("QA-1", "Production", "Resolved")]); await settle();
  assert.equal(rows(app.render())[0].status, "Resolved", "the other account's resolution becomes visible");
  app.tick(); app.render(); app.effects();
  app.requests[2].respond([ticket("QA-2"), ticket("QA-1", "Production", "Resolved")]); await settle();
  assert.deepEqual(rows(app.render()).map(row => row.reference), ["QA-2", "QA-1"]);
  app.unmount();
  assert.equal(app.requests[2].options.signal.aborted, true);
  assert.equal(app.timers.size, 0);
  assert.equal([...app.listeners.values()].reduce((sum, set) => sum + set.size, 0), 0);
});

test("failed and malformed background refreshes preserve rows and offer inline retry", async () => {
  const app = harness();
  app.render(); app.effects(); app.requests[0].respond([ticket("QA-1")]); await settle();
  app.focus(); app.render(); app.effects();
  app.requests[1].reject(new Error("Connection interrupted")); await settle();
  let tree = app.render();
  assert.equal(rows(tree)[0].reference, "QA-1");
  assert.match(alertText(tree), /Connection interrupted.*Showing previously loaded tickets/);
  button(tree, "Retry").props.onClick(); app.render(); app.effects();
  app.requests[2].malformed(); await settle();
  tree = app.render();
  assert.equal(rows(tree)[0].reference, "QA-1");
  assert.match(alertText(tree), /Could not load tickets/);
  button(tree, "Retry").props.onClick(); app.render(); app.effects();
  app.requests[3].respond({records: []}); await settle();
  assert.equal(rows(app.render())[0].reference, "QA-1");
  assert.match(alertText(app.render()), /Could not load tickets/);
  button(app.render(), "Retry").props.onClick(); app.render(); app.effects();
  app.requests[4].respond([]); await settle();
  assert.deepEqual(rows(app.render()), []);
  assert.equal(alertText(app.render()), "");
});

test("first-load errors are inline and Retry can recover", async () => {
  const app = harness();
  app.render(); app.effects(); app.requests[0].respond({error: "Session unavailable"}, false); await settle();
  const tree = app.render();
  assert.deepEqual(rows(tree), []);
  assert.match(alertText(tree), /Session unavailable/);
  button(tree, "Retry").props.onClick(); app.render(); app.effects();
  app.requests[1].respond([ticket("QA-1")]); await settle();
  assert.equal(rows(app.render()).length, 1);
});

test("category changes abort old loads, immediately hide prior-category data and ignore out-of-order results", async () => {
  const app = harness(admin);
  app.render(); app.effects(); app.requests[0].respond([ticket("QA-1")]); await settle();
  const tree = changeCategory(app, "MIS");
  assert.deepEqual(rows(tree), []);
  assert.equal(app.requests[0].options.signal.aborted, true);
  assert.equal(app.requests[1].url, "/api/tickets?category=MIS");
  changeCategory(app, "Production");
  assert.equal(app.requests[1].options.signal.aborted, true);
  app.requests[2].respond([ticket("QA-2")]); await settle();
  app.requests[1].respond([ticket("QA-MIS", "MIS")]); await settle();
  assert.deepEqual(rows(app.render()).map(row => row.reference), ["QA-2"]);
});

test("account changes never retain another user's tickets, errors, or dialogs", async () => {
  const app = harness(admin);
  app.render(); app.effects(); app.requests[0].respond([ticket("QA-ADMIN")]); await settle();
  button(app.render(), "Resolve").props.onClick();
  app.focus(); app.render(); app.effects();
  let tree = app.render(production);
  assert.deepEqual(rows(tree), [], "cross-account data is hidden before effects flush");
  assert.equal(all(tree, node => node.type === TicketResolutionForm).length, 0, "the previous account's dialog is hidden immediately too");
  app.effects();
  tree = app.render();
  assert.equal(all(tree, node => node.type === TicketResolutionForm).length, 0);
  assert.equal(app.requests[1].options.signal.aborted, true);
  assert.equal(app.requests[2].options.headers.Authorization, "Bearer qa-production");
  app.requests[1].respond([ticket("QA-ADMIN-LATE")]); await settle();
  app.requests[2].reject(new Error("Offline")); await settle();
  assert.deepEqual(rows(app.render()), []);
  assert.match(alertText(app.render()), /Offline/);
});

test("unmounted Tickets ignores a pending read and removes background listeners", async () => {
  const app = harness();
  app.render(); app.effects(); app.unmount();
  assert.equal(app.requests[0].options.signal.aborted, true);
  app.requests[0].respond([ticket("QA-LATE")]); await settle();
  assert.deepEqual(rows(app.render()), []);
  app.focus(); app.tick();
  assert.equal(app.requests.length, 1);
});

for (const category of ["", "Production", "General"]) test(`creating preserves the ${category || "All categories"} filter and cannot be undone by an older GET`, async () => {
  const app = harness();
  app.render(); app.effects(); app.requests[0].respond([ticket("QA-OLD", "General")]); await settle();
  if (category) {
    changeCategory(app, category);
    app.requests.at(-1).respond(category === "General" ? [ticket("QA-OLD", "General")] : []); await settle();
  }
  app.focus(); app.render(); app.effects();
  const staleRead = app.requests.at(-1);
  createdCallback(app)(ticket("QA-NEW"));
  const expected = category === "General" ? ["QA-OLD"] : category === "Production" ? ["QA-NEW"] : ["QA-NEW", "QA-OLD"];
  assert.equal(staleRead.options.signal.aborted, true);
  staleRead.respond([ticket("QA-STALE")]); await settle();
  assert.deepEqual(rows(app.render()).map(row => row.reference), expected);
  app.effects();
  assert.equal(app.requests.at(-1).url, `/api/tickets${category ? `?category=${category}` : ""}`);
});

test("resolution replaces its row in place, retains filters and survives stale reads", async () => {
  const app = harness(admin);
  app.render(); app.effects(); app.requests[0].respond([ticket("QA-FIRST"), ticket("QA-TARGET")]); await settle();
  app.focus(); app.render(); app.effects();
  const staleRead = app.requests.at(-1);
  const resolves = all(app.render(), node => node.type === "button" && text(node).trim() === "Resolve");
  resolves[1].props.onClick();
  all(app.render(), node => node.type === TicketResolutionForm)[0].props.onResolved(ticket("QA-TARGET", "Production", "Resolved"));
  staleRead.respond([ticket("QA-FIRST"), ticket("QA-TARGET")]); await settle();
  assert.deepEqual(rows(app.render()).map(row => [row.reference, row.status]), [["QA-FIRST", "Open"], ["QA-TARGET", "Resolved"]]);
});

test("ordinary users and managers retain view-only resolution rights", async () => {
  for (const session of [production, {...admin, permissions: {adminLevel: "Manager"}}]) {
    const app = harness(session);
    app.render(); app.effects(); app.requests[0].respond([ticket("QA-1")]); await settle();
    assert.equal(button(app.render(), "Resolve"), undefined);
    assert.ok(button(app.render(), "Create ticket"));
  }
});
