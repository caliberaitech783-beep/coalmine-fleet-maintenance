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
const { DailyUpdatesList, setDailyUpdatesOrder } = new Function(...Object.keys(bindings), `${code}; return { DailyUpdatesList, setDailyUpdatesOrder };`)(...Object.values(bindings));
const render = (props) => renderToStaticMarkup(React.createElement(DailyUpdatesList, props));

test("the updates cell collapses to a count with the latest time and opens into a scrolling, numbered list", () => {
  const html = render({ remarks: updates, category: "Breakdown" });
  assert.match(html, /^<details class="daily-remarks" data-order="newest"><summary><b>4 updates<\/b><small>Latest 16-09-2026 08:38:00 PM<\/small><\/summary>/);
  assert.match(html, /<div class="daily-remarks-order" role="group" aria-label="Order of daily updates"><span>Show<\/span><button type="button" aria-pressed="true" title="[^"]+">Newest first<\/button><button type="button" aria-pressed="false" title="[^"]+">Oldest first<\/button><\/div>/);
  assert.match(html, /<ol class="daily-remarks-list" aria-label="4 updates, newest first">/);
  const badges = [...html.matchAll(/<i aria-label="Update (\d) of 4">#(\d)<\/i><b>([^<]+)<\/b><span>([^<]+)<\/span>/g)].map((match) => match.slice(1));
  assert.deepEqual(badges, [["4", "4", "16-09-2026 08:38:00 PM", "SUNIL KUMAR MAHATO"], ["3", "3", "15-09-2026 09:24:00 PM", "SUNIL KUMAR MAHATO"], ["2", "2", "14-09-2026 07:46:00 PM", "SUNIL KUMAR MAHATO"], ["1", "1", "13-09-2026 07:27:00 PM", "SUNIL KUMAR MAHATO"]]);
  assert.match(html, /<p>Compressor removed<\/p><small>Breakdown · Delayed reason: Waiting for compressor assembly<\/small>/, "legacy delayReason values still show");
  assert.match(html, /<p>Inspection completed<\/p><small>Breakdown · Delayed reason: Parts inspection<\/small>/);
  assert.match(html, /<footer class="daily-remarks-more">Scroll inside the list to see all 4 updates<\/footer><\/div><\/details>$/);
});

test("short histories need no scroll hint, missing authors and categories degrade cleanly, and no updates shows a dash", () => {
  const html = render({ remarks: updates.slice(0, 2).map((item) => ({ ...item, authorName: "" })) });
  assert.match(html, /<summary><b>2 updates<\/b>/);
  assert.doesNotMatch(html, /daily-remarks-more/);
  assert.match(html, /<span>Maintenance User<\/span>/);
  assert.match(html, /<small>Delayed reason: Waiting for compressor assembly<\/small>/);
  assert.equal(render({ remarks: [updates[0]] }).match(/<summary><b>1 update<\/b>/)?.length, 1);
  assert.equal(render({ remarks: [] }), "—");
  assert.equal(render({}), "—");
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

test("every table cell renders the shared list and the BD Balance column sorts by the latest update", () => {
  const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(main, /import DailyUpdatesList from "\.\/daily-updates-list\.jsx";/);
  assert.match(main, /function MaintenanceRemarks\(\{ remarks = \[\], category = "" \}\) \{\s*\/\/[^\n]*\s*return <DailyUpdatesList remarks=\{remarks\} category=\{category\} formatDateTime=\{formatTwelveHourDateTime\} \/>;/);
  const browser = readFileSync(new URL("../src/dashboard-record-browser.jsx", import.meta.url), "utf8");
  assert.equal((browser.match(/<td data-sort-value=\{latestUpdateStamp\(record\.dailyRemarks\)\}><Remarks remarks=\{record\.dailyRemarks\} \/><\/td>/g) || []).length, 2);
  const css = readFileSync(new URL("../src/daily-updates.css", import.meta.url), "utf8");
  assert.match(css, /\.daily-remarks \.daily-remarks-list\{[^}]*max-height:270px;overflow-y:auto/);
  assert.match(css, /@media print\{\.daily-remarks-order,\.daily-remarks-more\{display:none\}\.daily-remarks \.daily-remarks-list\{max-height:none;overflow:visible\}\}/);
});
