import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";
import { isSessionViewOnlyUser } from "../user-session-access.mjs";
import { canViewBdAgeingReport } from "../bd-ageing-report.mjs";
import { ibossAccountsAllowed } from "../iboss-access.mjs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const sideSource = source.slice(source.indexOf("function Side("), source.indexOf("function formatTwelveHourDateTime("));
const {code} = await transformWithOxc(sideSource, "side-navigation.jsx", {jsx: {runtime: "classic"}});
const Null = () => null;

function harness(initialWidth, transferAllowed=false) {
  let width = initialWidth, cursor = 0;
  const slots = [], queries = new Map(), effects = [], listeners = new Map();
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
  const scope = {document: {getElementById:()=>null,addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type)}, React, useState, useEffect: effect => effects.push(effect), window: {matchMedia},
    masterNav: [["Equipment master", Null]], nav: [["Dashboard", Null]], whatsappNav: [], operationalWorkspaceNav: [], reportCategoryTabs: [],
    navigationPermissionsForView: permission => permission, masterAccessAllows: () => true, accessAllows: () => true,
    reportCategoryIdsForUser: () => [], reportAccessAllows: () => true, ibossAccountsAllowed, isSessionViewOnlyUser, canViewBdAgeingReport, useEmployeeTransferAccess:()=>transferAllowed,
    profileHeaderName: name => name, profileHeaderDesignation: () => "Admin", UserProfile: Null, authToken: "", isCdirMaster: () => false, BookUser: Null, cdirMasterNavItems: [], ClockMenu: Null, Database: Null, adminDatabaseNav: [], backupAdminPages: new Set(), databaseToolPages: new Set(),
    ...Object.fromEntries(["CaliberBrand", "Menu", "ChevronDown", "MessageCircle", "Users", "LogOut", "DoorExitIcon", "FileBarChart", "Landmark"].map(name => [name, Null])),
  };
  const Side = new Function(...Object.keys(scope), `${code}; return Side;`)(...Object.values(scope));
  return {
    render(open,session = {name: "Fixture"}) {cursor = 0; return Side({active: "Dashboard", open, session, setActive() {}, logout() {}});},
    mountEffects() {const current = effects.splice(0); current.forEach(effect => effect());},
    dispatch(type, event) {listeners.get(type)?.(event);},
    resize(nextWidth) {width = nextWidth; for (const query of queries.values()) [...query.callbacks].forEach(callback => callback());},
  };
}

test('BD Ageing navigation is restricted to exact allowed accounts, including on mobile',()=>{
  for (const width of [390,1920]) {
    for (const login of ['MOHITCHADDA','MANISHCHADDA','RAHULCHADDA','THAKUR@1990']) assert.match(renderToStaticMarkup(harness(width).render(true,{login})),/BD Ageing Report/);
    assert.doesNotMatch(renderToStaticMarkup(harness(width).render(true,{login:'admin',role:'super',name:'MOHITCHADDA'})),/BD Ageing Report/);
  }
});

test('Employee Transfer navigation follows the server capability on desktop and mobile',()=>{
 for(const width of [390,1920]){
  assert.match(renderToStaticMarkup(harness(width,true).render(true)),/data-workspace="employee-transfer"/);
  assert.doesNotMatch(renderToStaticMarkup(harness(width,false).render(true)),/data-workspace="employee-transfer"/);
 }
});

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


test("navigation closes peers, selected destinations, outside clicks and Escape", () => {
  const app = harness(1920);
  const all = node => !node || typeof node !== 'object' ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(all)];
  const button = name => all(app.render(true)).find(node => node.props?.['data-nav'] === name);
  app.render(true); app.mountEffects();
  button('masters').props.onClick();
  assert.equal(button('masters').props['aria-expanded'], true);
  button('cd').props.onClick();
  assert.equal(button('masters').props['aria-expanded'], false);
  assert.equal(button('cd').props['aria-expanded'], true);
  app.dispatch('keydown', {key:'Escape'});
  assert.equal(button('cd').props['aria-expanded'], false);
  button('masters').props.onClick();
  const destination = all(app.render(true)).find(node => node.props?.role === 'menuitem');
  destination.props.onClick({currentTarget:{blur(){}}});
  assert.equal(button('masters').props['aria-expanded'], false);
  button('masters').props.onClick();
  app.dispatch('pointerdown', {target:{closest:()=>null}});
  assert.equal(button('masters').props['aria-expanded'], false);
});
