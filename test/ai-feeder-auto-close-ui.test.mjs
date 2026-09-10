import {requestStatusLabel} from '../src/request-status.mjs';
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { transformWithOxc } from "vite";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const panel = source.slice(source.indexOf("function AiFeederPanel("), source.indexOf("function AiFeeder("));
const {code} = await transformWithOxc(panel, "info-pulse-panel.jsx", {jsx: {runtime: "classic"}});
const Null = () => null;
const descendants = (tree, predicate) => {
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
const closeButton = tree => descendants(tree, node => node.props["aria-label"] === "Close Info Pulse")[0];
function harness() {
  let cursor = 0, now = 0, nextTimer = 0;
  const slots = [], effects = new Map(), pending = [], timers = new Map(), listeners = new Map();
  const useState = initial => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
    return [slots[i], value => {slots[i] = typeof value === "function" ? value(slots[i]) : value;}];
  };
  const useEffect = (effect, deps) => {
    const i = cursor++;
    const previous = effects.get(i);
    if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) {
      pending.push(() => {previous?.cleanup?.(); effects.set(i, {deps, cleanup: effect()});});
    }
  };
  const document = {activeElement: null, body: {style: {overflow: "auto"}},
    addEventListener(type, handler) {if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(handler);},
    removeEventListener(type, handler) {listeners.get(type)?.delete(handler);},
  };
  const scope = {requestStatusLabel,React, useState, useRef: value => useState(() => ({current: value}))[0], useEffect,
    Date: {now: () => now}, document, window: {setInterval(callback) {const id = ++nextTimer; timers.set(id, callback); return id;}, clearInterval(id) {timers.delete(id);}},
    InfoPulseContent: Null, createPortal: tree => tree,
    ...Object.fromEntries(["Activity", "MapPin", "Clock", "X", "Truck", "ChevronDown", "Bell"].map(name => [name, Null])),
  };
  const Component = new Function(...Object.keys(scope), `${code}; return AiFeederPanel;`)(...Object.values(scope));
  return {
    timers, document,
    render(props) {cursor = 0; const tree = Component({summary: {total: 0, critical: 0, warning: 0, info: 0}, ...props}); while (pending.length) pending.shift()(); return tree;},
    advance(milliseconds, {tick = true} = {}) {now += milliseconds; if (tick) [...timers.values()].forEach(callback => callback());},
    dispatch(type, event = {}) {[...(listeners.get(type) || [])].forEach(callback => callback(event));},
    unmount() {for (const effect of effects.values()) effect.cleanup?.(); effects.clear();},
  };
}

test("Info Pulse has an immediate Close button and remains open after the former login deadline", () => {
  const app = harness();
  let closes = 0;
  const props = {onClose: () => {closes++;}};
  const tree = app.render(props);
  assert.ok(closeButton(tree));
  assert.equal(descendants(tree, node => node.props.role === "timer").length, 0);
  assert.equal(app.timers.size, 0);
  app.advance(59_999);
  assert.equal(closes, 0);
  assert.ok(closeButton(app.render(props)));
  app.advance(1);
  assert.equal(closes, 0);
  assert.equal(app.timers.size, 0);
  app.dispatch("visibilitychange");
  app.dispatch("visibilitychange");
  app.advance(3_600_000);
  assert.equal(closes, 0);
  app.unmount();
  assert.equal(app.document.body.style.overflow, "auto");
});

test("backgrounding and refreshed data never dismiss the panel; Escape uses the latest handler", () => {
  const app = harness();
  let stale = 0, current = 0;
  app.render({ready: false, onClose: () => {stale++;}});
  app.advance(30_000);
  app.render({ready: true, cases: [{key: 'refreshed'}], updatedAt: 30_000, onClose: () => {current++;}});
  app.advance(45_000, {tick: false});
  app.dispatch("visibilitychange");
  app.dispatch("visibilitychange");
  assert.equal(stale, 0);
  assert.equal(current, 0);
  app.dispatch("keydown", {key: "Escape"});
  assert.equal(stale, 0);
  assert.equal(current, 1);
  app.unmount();
});

test("manual reopening is immediately dismissible and never schedules an automatic close", () => {
  for (const method of ["button", "Escape"]) {
    const app = harness();
    let closes = 0;
    const props = {onClose: () => {closes++;}};
    const tree = app.render(props);
    assert.ok(closeButton(tree));
    assert.equal(descendants(tree, node => node.props.role === "timer").length, 0);
    assert.equal(app.timers.size, 0);
    app.advance(120_000);
    app.dispatch("visibilitychange");
    assert.equal(closes, 0);
    if (method === "button") closeButton(tree).props.onClick();
    else app.dispatch("keydown", {key: "Escape"});
    assert.equal(closes, 1);
    app.unmount();
  }
});

test("unmount restores scrolling and focus and removes the dismissal listener", () => {
  const app = harness();
  let closes = 0;
  let focusRestored = 0;
  app.document.activeElement = {focus() {focusRestored++;}};
  app.render({onClose: () => {closes++;}});
  assert.equal(app.document.body.style.overflow, "hidden");
  app.unmount();
  assert.equal(app.document.body.style.overflow, "auto");
  assert.equal(focusRestored, 1);
  assert.equal(app.timers.size, 0);
  app.advance(90_000);
  app.dispatch("visibilitychange");
  app.dispatch("keydown", {key: "Escape"});
  assert.equal(closes, 0);
});
