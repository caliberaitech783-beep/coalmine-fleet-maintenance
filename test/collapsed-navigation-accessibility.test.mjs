import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const sideSource = source.slice(source.indexOf("function Side("), source.indexOf("function formatTwelveHourDateTime("));
const {code} = await transformWithOxc(sideSource, "side-navigation.jsx", {jsx: {runtime: "classic"}});
const Null = () => null;

function harness(initialWidth) {
  let width = initialWidth, cursor = 0;
  const slots = [], queries = new Map(), effects = [];
  const useState = initial => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
    return [slots[i], value => {slots[i] = typeof value === "function" ? value(slots[i]) : value;}];
  };
  const matchMedia = query => {
    if (!queries.has(query)) {
      const callbacks = new Set();
      const breakpoint = Number(query.match(/(\d+)px/)[1]);
      queries.set(query, {get matches() {return width <= breakpoint;}, addEventListener: (_type, fn) => callbacks.add(fn), removeEventListener: (_type, fn) => callbacks.delete(fn), callbacks});
    }
    return queries.get(query);
  };
  const scope = {React, useState, useEffect: effect => effects.push(effect), window: {matchMedia},
    masterNav: [["Equipment master", Null]], nav: [["Dashboard", Null]], whatsappNav: [], operationalWorkspaceNav: [], reportCategoryTabs: [],
    navigationPermissionsForView: permission => permission, masterAccessAllows: () => true, accessAllows: () => true,
    reportCategoryIdsForUser: () => [], reportAccessAllows: () => true,
    profileHeaderName: name => name, profileHeaderDesignation: () => "Admin", UserProfile: Null,
    ...Object.fromEntries(["CaliberBrand", "Menu", "ChevronDown", "MessageCircle", "Users", "LogOut"].map(name => [name, Null])),
  };
  const Side = new Function(...Object.keys(scope), `${code}; return Side;`)(...Object.values(scope));
  return {
    render(open) {cursor = 0; return Side({active: "Dashboard", open, session: {name: "Fixture"}, setActive() {}, logout() {}});},
    mountEffects() {const current = effects.splice(0); current.forEach(effect => effect());},
    resize(nextWidth) {width = nextWidth; for (const query of queries.values()) [...query.callbacks].forEach(callback => callback());},
  };
}

test("closed offscreen navigation is inert and hidden from assistive technology at tablet/mobile widths", () => {
  for (const width of [390, 900, 1024, 1250]) {
    const tree = harness(width).render(false);
    assert.equal(tree.props.id, "admin-primary-navigation");
    assert.equal(tree.props.inert, true, String(width));
    assert.equal(tree.props["aria-hidden"], true, String(width));
    const html = renderToStaticMarkup(tree);
    assert.match(html, /<aside[^>]+inert=""/);
    assert.match(html, /aria-hidden="true"/);
  }
});

test("opening navigation restores its controls, while wide desktop navigation never becomes inert", () => {
  for (const [width, open] of [[1024, true], [390, true], [1251, false], [1920, false], [1920, true]]) {
    const tree = harness(width).render(open);
    assert.equal(tree.props.inert, undefined);
    assert.equal(tree.props["aria-hidden"], undefined);
    assert.equal(tree.props.className, open ? "open" : "");
  }
});

test("crossing the CSS navigation breakpoint updates inertness without changing mobile permissions", () => {
  const app = harness(1400);
  assert.equal(app.render(false).props.inert, undefined);
  app.mountEffects();
  app.resize(1024);
  assert.equal(app.render(false).props.inert, true);
  assert.equal(app.render(true).props.inert, undefined);
  app.resize(1400);
  assert.equal(app.render(false).props.inert, undefined);
  assert.match(sideSource, /navigationPermissionsForView\(permissions,responsiveMobile\)/);
  assert.match(sideSource, /window\.matchMedia\("\(max-width: 900px\)"\)/);
});

test("hamburger announces its action, expansion state and controlled navigation", () => {
  const toggle = source.match(/<button[^>]*className="menubtn"[^>]*>/)?.[0];
  assert.ok(toggle);
  assert.match(toggle, /type="button"/);
  assert.match(toggle, /aria-label=\{menu \? "Close navigation menu" : "Open navigation menu"\}/);
  assert.match(toggle, /aria-expanded=\{menu\}/);
  assert.match(toggle, /aria-controls="admin-primary-navigation"/);
  assert.match(source, /<aside id="admin-primary-navigation"/);
});
