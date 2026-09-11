import test from "node:test";
import assert from "node:assert/strict";
import { hourlyBreakdownEvents, hourlyBreakdownView, openHourlyBreakdownTab, breakdownElapsed } from "../src/hourly-breakdown.mjs";
import { REGION_DATA } from "../region-scope.mjs";

test("site aliases merge, permitted zero-count sites remain, and timers stop on closure", () => {
  const now = Date.parse("2026-09-11T12:00:00+05:30");
  const requests = [
    {site: "SASTI", start: "2026-09-11 11:30"},
    {site: "SASTI OB", start: "2026-09-11 11:00", closedAt: "2026-09-11 11:45"},
  ];
  const view = hourlyBreakdownView(requests, 1, "Sasti OB", now, REGION_DATA.flatMap(region => region.sites));
  assert.equal(view.siteCounts.length, 9);
  assert.equal(view.siteCounts.filter(row => row.site === "Sasti OB").length, 1);
  assert.equal(view.rows.length, 3);
  assert.equal(view.siteCounts.find(row => row.site === "Lalpeth OB").count, 0);
  const active = view.rows.find(row => row.closedAt == null);
  const closed = view.rows.find(row => row.direction === "Out");
  assert.equal(breakdownElapsed(active, now), "0h 30m 0s");
  assert.equal(breakdownElapsed(active, now + 1000), "0h 30m 1s");
  assert.equal(breakdownElapsed(closed, now + 1000), "0h 45m 0s");
});

test("rolling windows include recent entries and exits independently with IST timestamps", () => {
  const now = Date.parse("2026-09-11T12:00:00+05:30");
  const rows = [
    { ref: "A", site: "Sasti OB", door: "V1", start: "2026-09-11 11:00:00", closedAt: "2026-09-11 11:30:00" },
    { ref: "B", start: "2026-09-11 10:59:59" },
    { ref: "C", start: "2026-09-11 12:00:01" },
    { ref: "D", start: "invalid" },
  ];
  assert.deepEqual(hourlyBreakdownEvents(rows, 1, now).map(row => row.direction), ["Out", "In"]);
  assert.equal(hourlyBreakdownEvents(rows, 2, now).length, 3);
  assert.equal(hourlyBreakdownEvents(rows, 10, now).length, 3);
  assert.equal(hourlyBreakdownEvents(rows, 11, now).length, 0);
  assert.equal(hourlyBreakdownEvents(rows, 1, now)[0].door, "V1");
});

test("hour and site counts match the filtered report and include zero-count sites", () => {
  const now = Date.parse("2026-09-11T12:00:00+05:30");
  const rows = [
    {site: "Sasti OB", start: "2026-09-11 11:30", closedAt: "2026-09-11 11:45"},
    {site: "Majri OB", start: "2026-09-11 10:30"},
  ];
  const all = hourlyBreakdownView(rows, 1, "", now);
  assert.equal(all.total, 2);
  assert.deepEqual(all.siteCounts, [{site: "Majri OB", count: 0}, {site: "Sasti OB", count: 2}]);
  assert.deepEqual(all.hourCounts.slice(0, 2), [2, 3]);
  const majri = hourlyBreakdownView(rows, 2, "Majri OB", now);
  assert.equal(majri.rows.length, 1);
  assert.deepEqual(majri.hourCounts.slice(0, 2), [0, 1]);
});

test("hour selector and site filters render the report inline in the inherited theme", () => {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.dataset = {}; }
    appendChild(node) { this.children.push(node); }
    setAttribute(key, value) { this.attributes[key] = value; }
    replaceChildren() { this.children = []; }
  }
  const doc = {head: new Element("head"), body: new Element("body"), documentElement: new Element("html"), createElement: tag => new Element(tag)};
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  globalThis.window = {open: () => ({document: doc})};
  globalThis.document = {documentElement: {dataset: {theme: "dark"}}, body: {dataset: {}}};
  try {
    openHourlyBreakdownTab([{site: "Sasti OB"}, {site: "Majri OB"}]);
    const nodes = root => [root, ...root.children.flatMap(nodes)];
    const all = () => nodes(doc.body);
    const hours = all().find(node => node.className === "hours");
    const report = all().find(node => node.attributes["aria-label"] === "Hourly breakdown report");
    assert.equal(doc.documentElement.dataset.theme, "dark");
    assert.equal(hours.children.length, 10);
    assert.equal(all().some(node => node.tag === "dialog"), false);
    hours.children[1].onclick();
    assert.equal(hours.children[1].attributes["aria-pressed"], "true");
    const sites = all().find(node => node.className === "sites");
    sites.children[2].onclick();
    assert.match(nodes(report).find(node => node.tag === "h2").textContent, /Majri OB · Last 2 hours/);
    assert.deepEqual(nodes(report).filter(node => node.tag === "th").map(node => node.textContent), ["Sites", "Door No", "In\/Out", "BD Timing"]);
  } finally { globalThis.window = previousWindow; globalThis.document = previousDocument; }
});
