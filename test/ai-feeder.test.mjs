import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  AI_FEEDER_ROLE_ALERTS,
  AI_FEEDER_THRESHOLDS,
  aiFeederAlerts,
  aiFeederSummary,
  alertTypesForRole,
  parseIstTimestamp,
} from "../ai-feeder.mjs";

const NOW = Date.parse("2026-09-02T12:00:00+05:30");
const ist = (value) => value;
const at = (hoursAgo) => {
  const date = new Date(NOW - hoursAgo * 60 * 60 * 1000 + 5.5 * 60 * 60 * 1000);
  return `${date.toISOString().slice(0, 10)} · ${date.toISOString().slice(11, 16)}`;
};
const ahead = (hours) => at(-hours);

const typesFor = (requests, role) => aiFeederAlerts(requests, { role, now: NOW }).map((alert) => alert.type);

test("timestamps are read in India time", () => {
  assert.equal(parseIstTimestamp("2026-09-02 12:00"), NOW);
  assert.equal(parseIstTimestamp("2026-09-02 · 12:00:00"), NOW);
  assert.ok(Number.isNaN(parseIstTimestamp("")));
  assert.ok(Number.isNaN(parseIstTimestamp("not a date")));
});

test("a request past its ETC raises a critical alert", () => {
  const alerts = aiFeederAlerts([
    { ref: "REQ-1", equipmentGroup: "EXCAVATOR", door: "VPC70", status: "Open", start: at(4), expectedCompletionAt: ist(at(2)) },
  ], { role: "Admin", now: NOW });
  const overdue = alerts.find((alert) => alert.type === "etc-overdue");
  assert.ok(overdue, "an overdue alert should be raised");
  assert.equal(overdue.severity, "critical");
  assert.match(overdue.title, /EXCAVATOR · VPC70/);
  assert.match(overdue.detail, /2 hours ago/);
});

test("a closed request never raises overdue, long running or stale alerts", () => {
  const types = typesFor([
    { ref: "REQ-2", status: "Closed", closedAt: at(1), verifiedAt: at(1), start: at(240), expectedCompletionAt: ist(at(100)) },
  ], "Admin");
  assert.ok(!types.includes("etc-overdue"));
  assert.ok(!types.includes("long-running"));
  assert.ok(!types.includes("stale-update"));
});

test("a job running past the long running threshold is flagged", () => {
  const days = AI_FEEDER_THRESHOLDS.longRunningDays;
  const types = typesFor([{ ref: "REQ-3", status: "In progress", start: at(days * 24 + 1), dailyRemarks: "parts ordered" }], "Admin");
  assert.ok(types.includes("long-running"));

  const fresh = typesFor([{ ref: "REQ-4", status: "In progress", start: at(2), dailyRemarks: "parts ordered" }], "Admin");
  assert.ok(!fresh.includes("long-running"));
});

test("work closed but not verified is surfaced only after the waiting window", () => {
  const waited = AI_FEEDER_THRESHOLDS.awaitingVerificationHours;
  const stale = typesFor([{ ref: "REQ-5", status: "Closed", closedAt: at(waited + 1) }], "Admin");
  assert.ok(stale.includes("awaiting-verification"));

  const recent = typesFor([{ ref: "REQ-6", status: "Closed", closedAt: at(1) }], "Admin");
  assert.ok(!recent.includes("awaiting-verification"));
});

test("an open job with no daily remark is flagged once it goes a day without one", () => {
  const hours = AI_FEEDER_THRESHOLDS.staleUpdateHours;
  assert.ok(typesFor([{ ref: "REQ-7", status: "Open", start: at(hours + 1) }], "Admin").includes("stale-update"));
  assert.ok(!typesFor([{ ref: "REQ-8", status: "Open", start: at(hours + 1), dailyRemarks: "waiting on parts" }], "Admin").includes("stale-update"));
});

test("idle vehicles and brand new requests are reported", () => {
  assert.ok(typesFor([{ ref: "REQ-9", status: "Idle", idleReason: "No driver", start: at(2) }], "Admin").includes("idle-vehicle"));
  assert.ok(typesFor([{ ref: "REQ-10", status: "Open", start: at(1), complaint: "tyre burst" }], "Admin").includes("new-request"));
  assert.ok(!typesFor([{ ref: "REQ-11", status: "Open", start: at(AI_FEEDER_THRESHOLDS.newRequestHours + 5), dailyRemarks: "x" }], "Admin").includes("new-request"));
});

test("a request due back within the warning window is flagged, a distant one is not", () => {
  assert.ok(typesFor([{ ref: "REQ-12", status: "Open", start: at(2), expectedCompletionAt: ahead(1) }], "Admin").includes("etc-due-soon"));
  assert.ok(!typesFor([{ ref: "REQ-13", status: "Open", start: at(2), expectedCompletionAt: ahead(48) }], "Admin").includes("etc-due-soon"));
});

test("each role only receives the alerts it can act on", () => {
  const requests = [
    { ref: "REQ-A", status: "Open", start: at(4), expectedCompletionAt: ist(at(2)) },
    { ref: "REQ-B", status: "Open", start: at(2), expectedCompletionAt: ahead(1) },
    { ref: "REQ-C", status: "Closed", closedAt: at(30) },
    { ref: "REQ-D", status: "Open", start: at(40) },
  ];

  const mis = typesFor(requests, "MIS User");
  assert.ok(mis.includes("awaiting-verification"));
  assert.ok(!mis.includes("etc-due-soon"), "MIS does not schedule the workshop");
  assert.ok(!mis.includes("stale-update"));

  const production = typesFor(requests, "Production User");
  assert.ok(production.includes("etc-overdue"));
  assert.ok(!production.includes("awaiting-verification"), "production does not verify closures");

  const maintenance = typesFor(requests, "Maintenance User");
  assert.ok(maintenance.includes("etc-due-soon"));
  assert.ok(maintenance.includes("stale-update"));
  assert.ok(!maintenance.includes("awaiting-verification"));

  const admin = typesFor(requests, "Admin");
  for (const type of ["etc-overdue", "etc-due-soon", "awaiting-verification", "stale-update"]) {
    assert.ok(admin.includes(type), `admin should receive ${type}`);
  }
  assert.deepEqual(alertTypesForRole("Manager"), AI_FEEDER_ROLE_ALERTS.Admin);
  assert.deepEqual(alertTypesForRole("Unknown role"), AI_FEEDER_ROLE_ALERTS.Admin);
});

test("alerts are ordered by severity then recency and summarised by count", () => {
  const alerts = aiFeederAlerts([
    { ref: "REQ-N", status: "Open", start: at(1), complaint: "new" },
    { ref: "REQ-O", status: "Open", start: at(5), expectedCompletionAt: ist(at(3)) },
    { ref: "REQ-I", status: "Idle", idleReason: "No driver", start: at(2) },
  ], { role: "Admin", now: NOW });

  assert.equal(alerts[0].severity, "critical");
  assert.equal(alerts.at(-1).severity, "info");

  const summary = aiFeederSummary(alerts);
  assert.equal(summary.total, alerts.length);
  assert.equal(summary.critical + summary.warning + summary.info, alerts.length);
  assert.deepEqual(aiFeederSummary([]), { total: 0, critical: 0, warning: 0, info: 0 });
});

test("bad input is handled without throwing", () => {
  assert.deepEqual(aiFeederAlerts(), []);
  assert.deepEqual(aiFeederAlerts(null, { role: "Admin" }), []);
  assert.deepEqual(aiFeederAlerts([null, undefined], { role: "Admin" }), []);
  assert.deepEqual(aiFeederAlerts([{ ref: "REQ-X" }], { role: "Admin", now: "not a time" }), []);
});

test("the feed is capped so one bad day cannot flood the panel", () => {
  const requests = Array.from({ length: AI_FEEDER_THRESHOLDS.maxAlerts + 40 }, (unused, index) => ({
    ref: `REQ-CAP-${index}`, status: "Open", start: at(4), expectedCompletionAt: ist(at(2)),
  }));
  assert.equal(aiFeederAlerts(requests, { role: "Admin", now: NOW }).length, AI_FEEDER_THRESHOLDS.maxAlerts);
});

test("the AI feeder panel opens on login, counts down, and is reachable from the header", () => {
  const mainSource = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const styles = fs.readFileSync(new URL("../src/ai-feeder.css", import.meta.url), "utf8");

  assert.match(mainSource, /function AiFeederPanel\(/);
  assert.match(mainSource, /function AiFeeder\(/);
  // Auto-opens once per sign in, not on every re-render or refresh.
  assert.match(mainSource, /sessionStorage\.getItem\("aiFeederGreeted"\)/);
  assert.match(mainSource, /AI_FEEDER_AUTO_CLOSE_SECONDS = 59/);
  assert.match(mainSource, /window\.setInterval\(tick, 1000\)/);
  assert.match(mainSource, /if \(remaining === 0\) closeRef\.current\(\)/);
  assert.doesNotMatch(mainSource.slice(mainSource.indexOf("function AiFeederPanel("), mainSource.indexOf("function AiFeeder(")), /setPaused|onMouseEnter|onMouseLeave/);
  assert.match(mainSource, /INFO PULSE<\/span>/);
  assert.match(mainSource, /className="ai-feeder-dot"/);
  // Both shells carry the header entry.
  assert.equal(mainSource.match(/<AiFeeder\b/g)?.length, 2);
  assert.match(styles, /@keyframes ai-feeder-blink/);
  // The countdown is a clock-style chip whose fill drains as the seconds run out.
  assert.match(mainSource, /className="ai-feeder-countdown-fill"/);
  assert.match(mainSource, /00:\{String\(Math\.max\(0, seconds\)\)\.padStart\(2, "0"\)\}/);
  assert.doesNotMatch(mainSource, /ai-feeder-countdown-value/);
  assert.match(styles, /\.ai-feeder-countdown-fill\s*\{[^}]*transition:\s*width 1s linear/s);
});
