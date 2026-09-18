import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";
import * as order from "../src/daily-updates-order.mjs";
import { formatDisplayDateTime } from "../date-time-format.mjs";

const updates = [
  { createdAt: "2026-09-16 20:38", authorName: "SUNIL KUMAR MAHATO", remark: "Compressor assembly sent for upgradation", delayedReason: "Waiting for compressor assembly" },
  { createdAt: "2026-09-15 21:24", authorName: "SUNIL KUMAR MAHATO", remark: "Compressor assembly sent for upgradation", delayedReason: "Waiting for compressor assembly" },
  { createdAt: "2026-09-14 19:46", authorName: "SUNIL KUMAR MAHATO", remark: "Compressor removed", delayReason: "Waiting for compressor assembly" },
  { createdAt: "2026-09-13 19:27", authorName: "SUNIL KUMAR MAHATO", remark: "Inspection completed", delayedReason: "Parts inspection" },
];

test("daily updates sort newest-first by default and oldest-first on request, numbered from the first update", () => {
  const newest = order.sortDailyUpdates(updates);
  assert.deepEqual(newest.map((item) => item.ordinal), [4, 3, 2, 1]);
  assert.equal(newest[0].createdAt, "2026-09-16 20:38");
  const oldest = order.sortDailyUpdates(updates, "oldest");
  assert.deepEqual(oldest.map((item) => [item.ordinal, item.createdAt]), [[1, "2026-09-13 19:27"], [2, "2026-09-14 19:46"], [3, "2026-09-15 21:24"], [4, "2026-09-16 20:38"]]);
  // The stored order (newest first) is not trusted: a list saved oldest-first sorts the same way.
  assert.deepEqual(order.sortDailyUpdates([...updates].reverse(), "oldest").map((item) => item.ordinal), [1, 2, 3, 4]);
  assert.deepEqual(order.sortDailyUpdates([null, updates[0], undefined], "oldest").map((item) => item.remark), [updates[0].remark]);
  assert.deepEqual(order.sortDailyUpdates(undefined), []);
  assert.equal(order.sortDailyUpdates(updates, "sideways")[0].ordinal, 4, "unknown orders fall back to newest first");
});

test("ISO strings and Date objects order with the server's IST stamps", () => {
  const mixed = [{ createdAt: new Date("2026-09-10T09:00:00Z"), remark: "date" }, { createdAt: "2026-09-12T04:30:00.000Z", remark: "iso" }, { createdAt: "2026-09-11 08:00", remark: "server" }];
  assert.deepEqual(order.sortDailyUpdates(mixed, "oldest").map((item) => item.remark), ["date", "server", "iso"]);
  assert.equal(order.latestDailyUpdate(updates).createdAt, "2026-09-16 20:38");
  assert.equal(order.latestDailyUpdateStamp(updates), "2026-09-16 20:38");
  assert.equal(order.latestDailyUpdateStamp([]), "");
  assert.equal(order.dailyUpdatesCountLabel(1), "1 update");
  assert.equal(order.dailyUpdatesCountLabel(15), "15 updates");
});

test("author and delayed reason read every field shape the tables, journal and Info Pulse produce", () => {
  assert.equal(order.dailyUpdateAuthor({ authorName: "Site team", authorLogin: "site" }), "Site team");
  assert.equal(order.dailyUpdateAuthor({ author: " Pulse author " }), "Pulse author");
  assert.equal(order.dailyUpdateAuthor({ authorLogin: "mechanic" }), "mechanic");
  assert.equal(order.dailyUpdateAuthor({}), "");
  assert.equal(order.dailyUpdateReason({ delayedReason: "Approved reason", delayReason: "Legacy text" }), "Approved reason");
  assert.equal(order.dailyUpdateReason({ delayReason: " Legacy text " }), "Legacy text");
  assert.equal(order.dailyUpdateReason(null), "");
});

test("the chosen order is remembered on the device and survives a broken storage", () => {
  const store = new Map();
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  assert.equal(order.readDailyUpdatesOrder(storage), "newest");
  assert.equal(order.storeDailyUpdatesOrder(storage, "oldest"), "oldest");
  assert.equal(store.get(order.DAILY_UPDATES_ORDER_KEY), "oldest");
  assert.equal(order.readDailyUpdatesOrder(storage), "oldest");
  assert.equal(order.storeDailyUpdatesOrder(storage, "garbage"), "newest");
  assert.equal(order.readDailyUpdatesOrder(storage), "newest");
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(order.readDailyUpdatesOrder(broken), "newest");
  assert.equal(order.storeDailyUpdatesOrder(broken, "oldest"), "oldest");
  assert.equal(order.readDailyUpdatesOrder(null), "newest");
});

const source = readFileSync(new URL("../src/daily-updates-list.jsx", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace(/^export (default )?/gm, "");
const { code } = await transformWithOxc(source, "daily-updates-list.jsx", { jsx: { runtime: "classic" } });
const bindings = { React, useSyncExternalStore: React.useSyncExternalStore, ...order, formatDisplayDateTime };
const { DailyUpdatesList, DailyUpdatesPanel, setDailyUpdatesOrder } = new Function(...Object.keys(bindings), `${code}; return { DailyUpdatesList, DailyUpdatesPanel, setDailyUpdatesOrder };`)(...Object.values(bindings));
const render = (props, Component = DailyUpdatesList) => renderToStaticMarkup(React.createElement(Component, props));

test("the updates cell collapses to a count with the latest time and opens into a scrolling, numbered list", () => {
  const html = render({ remarks: updates, category: "Breakdown" });
  assert.match(html, /^<details class="daily-remarks"><summary><b>4 updates<\/b><small>Latest 16-09-2026 08:38:00 PM<\/small><\/summary><div class="daily-remarks-panel" data-order="newest">/);
  assert.match(html, /<div class="daily-remarks-order" role="group" aria-label="Order of daily updates"><span>Show<\/span><button type="button" aria-pressed="true" title="[^"]+">Newest first<\/button><button type="button" aria-pressed="false" title="[^"]+">Oldest first<\/button><\/div>/);
  assert.match(html, /<ol class="daily-remarks-list" aria-label="4 updates, newest first">/);
  const badges = [...html.matchAll(/<i aria-label="Update (\d) of 4">#(\d)<\/i><b>([^<]+)<\/b><span>([^<]+)<\/span>/g)].map((match) => match.slice(1));
  assert.deepEqual(badges, [["4", "4", "16-09-2026 08:38:00 PM", "SUNIL KUMAR MAHATO"], ["3", "3", "15-09-2026 09:24:00 PM", "SUNIL KUMAR MAHATO"], ["2", "2", "14-09-2026 07:46:00 PM", "SUNIL KUMAR MAHATO"], ["1", "1", "13-09-2026 07:27:00 PM", "SUNIL KUMAR MAHATO"]]);
  assert.match(html, /<p>Compressor removed<\/p><small>Breakdown · Delayed reason: Waiting for compressor assembly<\/small>/, "legacy delayReason values still show");
  assert.match(html, /<p>Inspection completed<\/p><small>Breakdown · Delayed reason: Parts inspection<\/small>/);
  assert.match(html, /<footer class="daily-remarks-more">Scroll inside the list to see all 4 updates<\/footer><\/div><\/details>$/);
});

test("short histories need no scroll hint, missing fields degrade cleanly, and no updates shows a dash", () => {
  const html = render({ remarks: updates.slice(0, 2).map((item) => ({ ...item, authorName: "" })) });
  assert.match(html, /<summary><b>2 updates<\/b>/);
  assert.doesNotMatch(html, /daily-remarks-more/);
  assert.match(html, /<span>—<\/span>/);
  assert.match(html, /<small>Delayed reason: Waiting for compressor assembly<\/small>/);
  assert.equal(render({ remarks: [updates[0]] }).match(/<summary><b>1 update<\/b>/)?.length, 1);
  assert.equal(render({ remarks: [] }), "—");
  assert.equal(render({}), "—");
});

test("the panel stands alone in the journal, time breakdown and Info Pulse with their own labels", () => {
  const pulseRecords = [{ remark: "Fresh saved note", delayReason: "New delay reason", createdAt: "", author: "mechanic" }, { remark: "Chain inspected", delayReason: "Vendor inspection pending", createdAt: "2026-09-14 18:00", author: "Site team" }];
  const html = render({ remarks: pulseRecords, missingLabel: "Not recorded", className: "pulse-updates-panel", formatDateTime: (value) => `${formatDisplayDateTime(value)} IST` }, DailyUpdatesPanel);
  assert.match(html, /^<div class="daily-remarks-panel pulse-updates-panel" data-order="newest">/);
  assert.match(html, /<i aria-label="Update 2 of 2">#2<\/i><b>14-09-2026 06:00:00 PM IST<\/b><span>Site team<\/span>/);
  assert.match(html, /<i aria-label="Update 1 of 2">#1<\/i><b>Date not recorded<\/b><span>mechanic<\/span><\/header><p>Fresh saved note<\/p><small>Delayed reason: New delay reason<\/small>/);
  assert.doesNotMatch(html, /<details|<summary/);
  const audited = render({ remarks: [{ createdAt: "2026-09-06 01:34", remark: "" }], missingLabel: "Not recorded", authorLabel: (item) => `${item.authorName || "Unknown"} (audit)` }, DailyUpdatesPanel);
  assert.match(audited, /<span>Unknown \(audit\)<\/span><\/header><p>Not recorded<\/p><small>Delayed reason: Not recorded<\/small>/);
  assert.equal(render({ remarks: [] }, DailyUpdatesPanel), "");
});

test("switching the order writes the device preference through the shared store", () => {
  const store = new Map();
  const fake = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: fake, configurable: true, writable: true });
  try {
    setDailyUpdatesOrder("oldest");
    assert.equal(store.get(order.DAILY_UPDATES_ORDER_KEY), "oldest");
    setDailyUpdatesOrder("nonsense");
    assert.equal(store.get(order.DAILY_UPDATES_ORDER_KEY), "newest");
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous); else delete globalThis.localStorage;
  }
});

test("every place that lists updates renders the shared panel and sorts its column by the latest update", () => {
  const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(main, /import DailyUpdatesList, \{ DailyUpdatesPanel \} from "\.\/daily-updates-list\.jsx";/);
  assert.match(main, /function MaintenanceRemarks\(\{ remarks = \[\], category = "" \}\) \{\s*\/\/[^\n]*\s*return <DailyUpdatesList remarks=\{remarks\} category=\{category\} formatDateTime=\{formatTwelveHourDateTime\} \/>;/);
  // The daily-update journal's read-only history.
  assert.match(main, /Previous daily updates[\s\S]{0,400}<DailyUpdatesPanel remarks=\{history\} category=\{request\.category\} formatDateTime=\{formatTwelveHourDateTime\} missingLabel="Not recorded" \/>/);
  // Workflow tables sort the Daily remarks column by the most recent update.
  assert.equal((main.match(/key === "dailyRemarks" \? latestDailyUpdateStamp\(row\.dailyRemarks\) : row\[key\]\)/g) || []).length, 2);
  // The time breakdown prints the panel with its own stylesheet.
  assert.match(main, /import dailyUpdatesPrintCss from "\.\/daily-updates\.css\?raw";/);
  assert.match(main, /printRequestTimeline\(content, [^\n]*`\$\{requestTimelinePrintCss\}\\n\$\{dailyUpdatesPrintCss\}`\)/);
  const browser = readFileSync(new URL("../src/dashboard-record-browser.jsx", import.meta.url), "utf8");
  assert.equal((browser.match(/<td data-sort-value=\{latestUpdateStamp\(record\.dailyRemarks\)\}><Remarks remarks=\{record\.dailyRemarks\} \/><\/td>/g) || []).length, 2);
  assert.match(browser, /<td key=\{column\.key\} data-sort-value=\{column\.sortValue \? column\.sortValue\(record\) : undefined\}>\{column\.render\(record\)\}<\/td>/);
  const oem = readFileSync(new URL("../src/oem-breakdown-details.jsx", import.meta.url), "utf8");
  assert.match(oem, /\{ key: "remarks", label: "Daily remarks", sortValue: record => latestUpdateStamp\(record\.requestDetails\.dailyRemarks\), render: /);
  const pulse = readFileSync(new URL("../src/info-pulse-content.jsx", import.meta.url), "utf8");
  assert.match(pulse, /import \{DailyUpdatesPanel\} from '\.\/daily-updates-list\.jsx';/);
  assert.match(pulse, /<h4>Daily updates <span>Read only<\/span><\/h4>\{updates\.length \? <DailyUpdatesPanel remarks=\{updates\} formatDateTime=\{value => `\$\{formatDisplayDateTime\(value\)\} IST`\} missingLabel="Not recorded" \/> : <p>No daily updates recorded\.<\/p>\}/);
  const timeline = readFileSync(new URL("../src/request-timeline.jsx", import.meta.url), "utf8");
  assert.match(timeline, /import \{DailyUpdatesPanel\} from "\.\/daily-updates-list\.jsx";/);
  assert.match(timeline, /<div className="request-timeline-updates"><DailyUpdatesPanel remarks=\{remarks\} category=\{request\.category\} formatDateTime=\{stamp\} missingLabel="Not recorded" authorLabel=\{entry => actorLabel\(\{actorName:entry\.authorName,actorLogin:entry\.authorLogin\}\)\} \/><\/div>/);
  const css = readFileSync(new URL("../src/daily-updates.css", import.meta.url), "utf8");
  assert.match(css, /\.daily-remarks-panel \.daily-remarks-list\{[^}]*max-height:270px;overflow-y:auto/);
  assert.match(css, /@media print\{\.daily-remarks-order,\.daily-remarks-more\{display:none\}\.daily-remarks-panel \.daily-remarks-list\{max-height:none;overflow:visible\}\}/);
  assert.doesNotMatch(css, /\.daily-update-history article/, "the journal no longer styles its own cards");
  const pulseCss = readFileSync(new URL("../src/info-pulse-content.css", import.meta.url), "utf8");
  assert.match(pulseCss, /\.pulse-panel \.pulse-updates-history \.daily-remarks-order button\[aria-pressed="true"\] \{ background: #56318f;/);
  assert.doesNotMatch(pulseCss, /\.pulse-updates-history dl/);
  const timelineCss = readFileSync(new URL("../src/request-timeline.css", import.meta.url), "utf8");
  assert.match(timelineCss, /\.request-timeline-updates \.daily-remarks-panel \.daily-remarks-list \{ max-height:340px; \}/);
  assert.doesNotMatch(timelineCss, /\.request-timeline-updates dd/);
});
