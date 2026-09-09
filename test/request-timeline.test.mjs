import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  REQUEST_TIMELINE_FIELDS,
  parseRequestTimelineTimestamp,
  requestExpectedCompletionValue,
  validateRequestTimelineChange,
  buildRequestTimelineChanges,
  requestTimelineDurations,
  formatTimelineDuration,
  requestTimelineEvents,
} from "../request-timeline.mjs";

const now = new Date("2026-09-08T10:30:00.789Z"); // 16:00 IST
const timeline = {
  start: "2026-09-08 10:00:01",
  acceptedAt: "2026-09-08 10:10:02",
  closedAt: "2026-09-08 11:30:03",
  firstTripAt: "2026-09-08 11:40:04",
  verifiedAt: "2026-09-08 11:45:05",
  expectedCompletionAt: "2026-09-08 12:00:00",
};
const iso = value => parseRequestTimelineTimestamp(value)?.toISOString() ?? null;
const assertTimelineError = (fn, pattern, code = "INVALID_REQUEST_TIMELINE") => {
  assert.throws(fn, error => {
    assert.equal(error.status, 400);
    assert.equal(error.code, code);
    assert.match(error.message, pattern);
    return true;
  });
};

test("strict calendar parsing rejects February31, invalid leap days and normalized clock dates", () => {
  for (const value of [
    "2026-02-31 10:00:00", "2026-02-29 10:00:00", "1900-02-29 10:00:00",
    "2026-04-31 10:00:00", "2026-00-10 10:00:00", "2026-13-01 10:00:00",
    "2026-09-00 10:00:00", "2026-09-32 10:00:00", "2026-09-08 24:00:00",
    "2026-09-08 29:00:00", "2026-09-08 10:60:00", "2026-09-08 10:00:60",
    "2026-02-31T10:00:00Z", "2026-09-08T10:00:00+24:00", "2026-09-08T10:00:00+05:60",
  ]) assert.equal(parseRequestTimelineTimestamp(value), null, value);
  assert.equal(iso("2024-02-29 10:00:00"), "2024-02-29T04:30:00.000Z");
  assert.equal(iso("2000-02-29 10:00:00"), "2000-02-29T04:30:00.000Z");
});

test("local workflow formats always mean IST and explicit timezone offsets preserve the same instant", () => {
  for (const value of [
    "2026-09-08 10:20:30.123", "2026-09-08T10:20:30.123",
    "2026-09-08 · 10:20:30.123", "2026-09-08 Â· 10:20:30.123",
    "2026-09-08T10:20:30.123+05:30", "2026-09-08T10:20:30.123+0530",
    "2026-09-08T04:50:30.123Z", "2026-09-08T00:50:30.123-04:00",
  ]) assert.equal(iso(value), "2026-09-08T04:50:30.123Z", value);
  assert.equal(iso("2026-09-08 10:20"), "2026-09-08T04:50:00.000Z");
  assert.equal(iso(" 2026-09-08 10:20:30 "), "2026-09-08T04:50:30.000Z");
  assert.equal(iso("2026-09-08 00:00:00"), "2026-09-07T18:30:00.000Z");
});

test("timestamps reject ambiguous partial inputs and never substitute the current clock", () => {
  for (const value of [undefined, null, "", " ", "2026-09-08", "10:20:30", "08/09/2026 10:20", "invalid", 0, {}, new Date(NaN)]) {
    assert.equal(parseRequestTimelineTimestamp(value), null, String(value));
  }
  const original = new Date("2026-09-08T04:50:30.123Z");
  const parsed = parseRequestTimelineTimestamp(original);
  assert.notEqual(parsed, original, "caller Date objects are not reused/mutated");
  assert.equal(parsed.getTime(), original.getTime());
});

test("parsing and durations are independent of the process timezone", () => {
  const moduleUrl = new URL("../request-timeline.mjs", import.meta.url).href;
  const script = `import {parseRequestTimelineTimestamp,requestTimelineDurations} from ${JSON.stringify(moduleUrl)}; process.stdout.write(JSON.stringify([parseRequestTimelineTimestamp('2026-09-08 10:20:30.123').toISOString(),requestTimelineDurations({start:'2026-09-08 10:00:00',acceptedAt:'2026-09-08 10:01:01'})]));`;
  const output = ["UTC", "Asia/Kolkata", "America/New_York"].map(TZ => execFileSync(process.execPath, ["--input-type=module", "-e", script], {encoding: "utf8", env: {...process.env, TZ}}));
  assert.equal(output[0], output[1]);
  assert.equal(output[1], output[2]);
  assert.equal(JSON.parse(output[0])[1].waiting, 61_000);
});

test("valid chronological changes preserve submitted values and do not mutate caller snapshots", () => {
  const before = {...timeline, complaint: "Unchanged"};
  const changes = {acceptedAt: "2026-09-08 10:15:02", complaint: "New remark"};
  const result = validateRequestTimelineChange(before, changes, {now, userEntered: ["acceptedAt"]});
  assert.deepEqual(result, {...before, ...changes});
  assert.equal(before.acceptedAt, timeline.acceptedAt);
  assert.deepEqual(changes, {acceptedAt: "2026-09-08 10:15:02", complaint: "New remark"});
});

test("each modified event must remain correctly ordered with other recorded workflow events", () => {
  for (const [event, value, pattern] of [
    ["start", "2026-09-08 10:11:00", /acceptance cannot be before production/i],
    ["acceptedAt", "2026-09-08 09:59:59", /acceptance cannot be before production/i],
    ["acceptedAt", "2026-09-08 11:31:00", /closure cannot be before maintenance acceptance/i],
    ["closedAt", "2026-09-08 10:09:59", /closure cannot be before maintenance acceptance/i],
    ["firstTripAt", "2026-09-08 11:29:59", /first trip cannot be before maintenance closure/i],
    ["verifiedAt", "2026-09-08 11:40:03", /verification cannot be before first trip/i],
  ]) assertTimelineError(() => validateRequestTimelineChange(timeline, {[event]: value}, {now}), pattern);
  assert.doesNotThrow(() => validateRequestTimelineChange(timeline, {firstTripAt: timeline.closedAt}, {now}));
  assert.doesNotThrow(() => validateRequestTimelineChange(timeline, {verifiedAt: timeline.firstTripAt}, {now}));
});

test("first-trip actual time preceding later MIS verification is valid, not a negative-duration defect", () => {
  const before = {...timeline, firstTripAt: null, verifiedAt: null};
  const next = validateRequestTimelineChange(before, {firstTripAt: "2026-09-08 11:31:00", verifiedAt: "2026-09-08 14:10:00"}, {now, userEntered: ["firstTripAt"]});
  assert.equal(requestTimelineDurations(next).verificationLag, 159 * 60_000);
});

test("missing optional legacy events do not fabricate timestamps or prevent correctly ordered later events", () => {
  const before = {start: timeline.start, acceptedAt: null, closedAt: timeline.closedAt};
  const next = validateRequestTimelineChange(before, {firstTripAt: timeline.firstTripAt, verifiedAt: timeline.verifiedAt}, {now, userEntered: ["firstTripAt"]});
  assert.equal(next.acceptedAt, null);
  assert.equal(requestTimelineDurations(next).maintenance, null);
  assert.equal(requestTimelineDurations(next).repairElapsed, 5_402_000);
});

test("unrelated legacy chronology inconsistencies do not block ETC or remarks, but changing an involved event checks them", () => {
  const legacy = {...timeline, acceptedAt: "2026-09-08 09:00:00", firstTripAt: "2026-09-08 11:29:00"};
  assert.doesNotThrow(() => validateRequestTimelineChange(legacy, {complaint: "Clarified", expectedCompletionAt: "2026-09-09 12:00:00"}, {now, userEntered: ["expectedCompletionAt"]}));
  assert.doesNotThrow(() => validateRequestTimelineChange(legacy, {}, {now}));
  assert.doesNotThrow(() => validateRequestTimelineChange(legacy, {acceptedAt: "2026-09-08T03:30:00Z"}, {now}));
  assertTimelineError(() => validateRequestTimelineChange(legacy, {acceptedAt: "2026-09-08 09:01:00"}, {now}), /before production/i);
});

test("future actual event input is rejected with millisecond precision, but planned ETC may be future", () => {
  const nowIso = now.toISOString();
  for (const event of REQUEST_TIMELINE_FIELDS.filter(event => event !== "expectedCompletionAt")) {
    assertTimelineError(() => validateRequestTimelineChange({}, {[event]: new Date(now.getTime() + 1)}, {now, userEntered: [event]}), /cannot be in the future/i);
    assert.doesNotThrow(() => validateRequestTimelineChange({}, {[event]: nowIso}, {now, userEntered: [event]}));
  }
  assert.doesNotThrow(() => validateRequestTimelineChange({}, {expectedCompletionAt: "2026-12-31 23:59:59"}, {now, userEntered: ["expectedCompletionAt"]}));
  assert.doesNotThrow(() => validateRequestTimelineChange({firstTripAt: "2026-12-31 23:59:59"}, {complaint: "Old imported record"}, {now, userEntered: ["firstTripAt"]}));
});

test("new invalid inputs are rejected even when a previous invalid legacy timestamp parses as null", () => {
  assertTimelineError(() => validateRequestTimelineChange({firstTripAt: "legacy-invalid"}, {firstTripAt: "2026-02-31 10:00:00"}, {now}), /valid first trip/i);
  assertTimelineError(() => validateRequestTimelineChange({}, {expectedCompletionAt: "2026-04-31 10:00"}, {now}), /valid expected completion/i);
  assert.doesNotThrow(() => validateRequestTimelineChange({firstTripAt: "legacy-invalid"}, {complaint: "Unrelated"}, {now}));
});

test("initial ETC gets user provenance without needing a correction reason", () => {
  const result = buildRequestTimelineChanges({}, {expectedCompletionAt: "2026-09-09 08:15:42.456"}, {
    events: ["expectedCompletionAt"], sources: {expectedCompletionAt: "user"}, now,
    actorLogin: "QA-MAINTENANCE", actorName: "QA Maintenance", requireCorrectionReason: ["expectedCompletionAt"],
  });
  assert.deepEqual(result, [{event: "expectedCompletionAt", oldValue: null, newValue: "2026-09-09T02:45:42.456Z", source: "user", recordedAt: now.toISOString(), actorLogin: "QA-MAINTENANCE", actorName: "QA Maintenance", reason: "", correction: false}]);
});

test("existing ETC correction requires a nonblank bounded reason and retains exact old/new values and actor snapshot", () => {
  const before = {expectedCompletionAt: "2026-09-08 12:00:17.123"};
  const after = {expectedCompletionAt: "2026-09-08 12:30:18.456"};
  const options = {events: ["expectedCompletionAt"], sources: {expectedCompletionAt: "user"}, now, actorLogin: "QA-EDITOR", actorName: "QA Editor", requireCorrectionReason: ["expectedCompletionAt"]};
  for (const reason of [undefined, "", " \n\t ", "x".repeat(501)]) {
    assertTimelineError(() => buildRequestTimelineChanges(before, after, {...options, reason}), /Explain|500/, "TIMELINE_CORRECTION_REASON_REQUIRED");
  }
  const [entry] = buildRequestTimelineChanges(before, after, {...options, reason: "  Parts delivery rescheduled  "});
  assert.deepEqual(entry, {event: "expectedCompletionAt", oldValue: "2026-09-08T06:30:17.123Z", newValue: "2026-09-08T07:00:18.456Z", source: "user", recordedAt: now.toISOString(), actorLogin: "QA-EDITOR", actorName: "QA Editor", reason: "Parts delivery rescheduled", correction: true});
  assert.doesNotThrow(() => buildRequestTimelineChanges(before, after, {...options, reason: "x".repeat(500)}));
});

test("equivalent timestamp representations and unchanged minute precision are true no-ops without a reason", () => {
  const options = {requireCorrectionReason: ["expectedCompletionAt"], now};
  assert.deepEqual(buildRequestTimelineChanges({expectedCompletionAt: "2026-09-08 12:00:00"}, {expectedCompletionAt: "2026-09-08T12:00"}, options), []);
  assert.deepEqual(buildRequestTimelineChanges({expectedCompletionAt: "2026-09-08 12:00:17.123"}, {expectedCompletionAt: "2026-09-08T06:30:17.123Z"}, options), []);
  assert.deepEqual(buildRequestTimelineChanges(timeline, {...timeline, complaint: "Changed complaint"}, options), []);
  assert.deepEqual(buildRequestTimelineChanges({firstTripAt: null}, {firstTripAt: ""}, options), []);
});

test("a real seconds-only ETC change cannot silently masquerade as an unchanged minute value", () => {
  assertTimelineError(() => buildRequestTimelineChanges(
    {expectedCompletionAt: "2026-09-08 12:00:17"}, {expectedCompletionAt: "2026-09-08 12:00:00"},
    {events: ["expectedCompletionAt"], now, requireCorrectionReason: ["expectedCompletionAt"]},
  ), /Explain/, "TIMELINE_CORRECTION_REASON_REQUIRED");
});

test("resaving the unchanged displayed ETC minute preserves legacy seconds and milliseconds exactly", () => {
  const stored = "2026-09-08T06:30:17.123Z";
  for (const display of ["2026-09-08T12:00", "2026-09-08 12:00", " 2026-09-08T12:00 "]) {
    const normalized = requestExpectedCompletionValue(stored, display);
    assert.equal(normalized.toISOString(), stored);
    assert.deepEqual(buildRequestTimelineChanges({expectedCompletionAt: stored}, {expectedCompletionAt: normalized}, {events: ["expectedCompletionAt"], requireCorrectionReason: ["expectedCompletionAt"], now}), []);
  }
  const original = new Date(stored);
  assert.equal(requestExpectedCompletionValue(original, "2026-09-08T12:00").getTime(), original.getTime());
  assert.equal(original.toISOString(), stored);
});

test("ETC minute preservation never conceals an explicit seconds correction or an actual changed minute/day", () => {
  const stored = "2026-09-08T06:30:17.123Z";
  for (const [value, expected] of [
    ["2026-09-08T12:00:00", "2026-09-08T06:30:00.000Z"],
    ["2026-09-08T12:00:17.124", "2026-09-08T06:30:17.124Z"],
    ["2026-09-08T12:01", "2026-09-08T06:31:00.000Z"],
    ["2026-09-09T12:00", "2026-09-09T06:30:00.000Z"],
  ]) {
    const normalized = requestExpectedCompletionValue(stored, value);
    assert.equal(normalized.toISOString(), expected);
    assertTimelineError(() => buildRequestTimelineChanges({expectedCompletionAt: stored}, {expectedCompletionAt: normalized}, {events: ["expectedCompletionAt"], requireCorrectionReason: ["expectedCompletionAt"], now}), /Explain/, "TIMELINE_CORRECTION_REASON_REQUIRED");
  }
  assert.equal(requestExpectedCompletionValue(null, "2026-09-08T12:00").toISOString(), "2026-09-08T06:30:00.000Z");
  assert.equal(requestExpectedCompletionValue(stored, "2026-02-31T12:00"), null);
  assert.equal(requestExpectedCompletionValue(stored, ""), null);
});

test("history records only approved timestamp fields/events and does not infer a trustworthy source", () => {
  const after = {start: timeline.start, acceptedAt: timeline.acceptedAt, complaint: "Secret-free fixture", fabricatedEvent: now.toISOString()};
  const result = buildRequestTimelineChanges({}, after, {events: ["acceptedAt", "fabricatedEvent", "complaint"], sources: {acceptedAt: "client-claims-system"}, now});
  assert.equal(result.length, 1);
  assert.equal(result[0].event, "acceptedAt");
  assert.equal(result[0].source, "unknown");
  assert.equal(result[0].actorLogin, "");
  assert.equal(result[0].actorName, "");
  assert.equal(result[0].newValue, iso(timeline.acceptedAt));
});

test("duration decomposition keeps precision, distinguishes missing from zero, and never clamps invalid negatives to zero", () => {
  assert.deepEqual(requestTimelineDurations(timeline), {
    waiting: 601_000, maintenance: 4_801_000, returnToWork: 601_000,
    overall: 6_003_000, repairElapsed: 5_402_000, verificationLag: 301_000,
  });
  const exact = "2026-09-08 10:00:00.123";
  assert.equal(requestTimelineDurations({start: exact, acceptedAt: exact}).waiting, 0);
  assert.equal(requestTimelineDurations({start: exact, acceptedAt: "2026-09-08 10:00:00.456"}).waiting, 333);
  assert.equal(requestTimelineDurations({start: timeline.acceptedAt, acceptedAt: timeline.start}).waiting, null);
  assert.equal(requestTimelineDurations({acceptedAt: timeline.acceptedAt}).waiting, null);
  assert.equal(requestTimelineDurations({start: "invalid", acceptedAt: timeline.acceptedAt}).waiting, null);
  assert.equal(requestTimelineDurations({...timeline, firstTripAt: "2026-09-08 11:29:59"}).returnToWork, null);
  assert.equal(requestTimelineDurations({...timeline, verifiedAt: "2026-09-08 11:39:59"}).verificationLag, null);
});

test("duration formatting retains seconds and distinguishes genuine zero from missing/invalid", () => {
  for (const invalid of [null, undefined, NaN, Infinity, -1]) assert.equal(formatTimelineDuration(invalid), "Not recorded");
  assert.equal(formatTimelineDuration(0), "0s");
  assert.equal(formatTimelineDuration(59_999), "59s");
  assert.equal(formatTimelineDuration(61_000), "1m 1s");
  assert.equal(formatTimelineDuration(90_061_000), "1d 1h 1m 1s");
});

test("legacy/imported current values remain visible with unknown provenance, not fabricated system actors", () => {
  const request = {...timeline, acceptedBy: "Legacy Display Name", closedBy: "Legacy Closer", source: "system", recordedAt: now.toISOString()};
  const events = requestTimelineEvents(request);
  for (const event of events) {
    assert.equal(event.source, "unknown");
    assert.equal(event.recordedAt, null);
    assert.equal(event.actorLogin, "");
    assert.equal(event.actorName, "");
    assert.equal(event.correction, false);
  }
  assert.equal(events.find(event => event.event === "acceptedAt").eventAt, iso(timeline.acceptedAt));
  assert.equal(events.find(event => event.event === "idealRequestedAt").eventAt, null);
});

test("event summaries use the latest matching saved history and preserve earlier correction entries unchanged", () => {
  const initial = buildRequestTimelineChanges({}, {expectedCompletionAt: timeline.expectedCompletionAt}, {events: ["expectedCompletionAt"], sources: {expectedCompletionAt: "user"}, now: "2026-09-08 10:10:00", actorLogin: "FIRST", actorName: "Initial Author"});
  const correction = buildRequestTimelineChanges({expectedCompletionAt: timeline.expectedCompletionAt}, {expectedCompletionAt: "2026-09-08 13:00:00"}, {events: ["expectedCompletionAt"], sources: {expectedCompletionAt: "user"}, now, actorLogin: "EDITOR", actorName: "Correction Author", reason: "Supplier changed ETA", requireCorrectionReason: ["expectedCompletionAt"]});
  const history = [...initial, ...correction];
  const snapshot = structuredClone(history);
  const result = requestTimelineEvents({expectedCompletionAt: "2026-09-08 13:00:00"}, history).find(event => event.event === "expectedCompletionAt");
  assert.equal(result.actorLogin, "EDITOR");
  assert.equal(result.actorName, "Correction Author");
  assert.equal(result.recordedAt, now.toISOString());
  assert.equal(result.reason, "Supplier changed ETA");
  assert.equal(result.source, "user");
  assert.equal(result.correction, true);
  assert.deepEqual(history, snapshot, "summarizing must not rewrite original event history");
  assert.equal(history[0].newValue, correction[0].oldValue);
});

test("history for a different saved value cannot falsely attribute the current legacy value", () => {
  const history = buildRequestTimelineChanges({}, {firstTripAt: "2026-09-08 12:00:00"}, {events: ["firstTripAt"], sources: {firstTripAt: "user"}, now, actorLogin: "OTHER"});
  const event = requestTimelineEvents({firstTripAt: timeline.firstTripAt}, history).find(event => event.event === "firstTripAt");
  assert.equal(event.eventAt, iso(timeline.firstTripAt));
  assert.equal(event.source, "unknown");
  assert.equal(event.actorLogin, "");
  assert.equal(event.recordedAt, null);
});

test("manager on-road closure is distinguished from maintenance closure and retains its server actor", () => {
  const request = {...timeline, idealRequestedAt: "2026-09-08 11:00:00", idealApprovedAt: timeline.closedAt};
  const history = buildRequestTimelineChanges({}, request, {events: ["closedAt", "idealApprovedAt"], sources: {closedAt: "system", idealApprovedAt: "system"}, now: timeline.closedAt, actorLogin: "QA-MANAGER", actorName: "QA Production Manager"});
  const events = requestTimelineEvents(request, history);
  const close = events.find(event => event.event === "closedAt");
  assert.equal(close.label, "Manager on-road closure");
  assert.equal(close.actorLogin, "QA-MANAGER");
  assert.equal(close.source, "system");
  const approval = events.find(event => event.event === "idealApprovedAt");
  assert.equal(approval.eventAt, close.eventAt);
  assert.equal(approval.label, "Manager on-road approval");
  assert.equal(requestTimelineEvents(timeline).find(event => event.event === "closedAt").label, "Maintenance closure");
});

test("cancel and re-idle history retains cleared earlier times while the summary uses the current interval", () => {
  const idle = {idealRequestedAt: "2026-09-08 11:00:00"};
  const cleared = {idealRequestedAt: null};
  const later = {idealRequestedAt: "2026-09-08 12:00:00"};
  const initial = buildRequestTimelineChanges({}, idle, {events: ["idealRequestedAt"], sources: {idealRequestedAt: "system"}, now: idle.idealRequestedAt, actorLogin: "MAINTENANCE"});
  const cancelled = buildRequestTimelineChanges(idle, cleared, {events: ["idealRequestedAt"], sources: {idealRequestedAt: "system"}, now: "2026-09-08 11:30:00", actorLogin: "MANAGER"});
  const reopened = buildRequestTimelineChanges(cleared, later, {events: ["idealRequestedAt"], sources: {idealRequestedAt: "system"}, now: later.idealRequestedAt, actorLogin: "MAINTENANCE"});
  const history = [...initial, ...cancelled, ...reopened];
  assert.equal(cancelled[0].oldValue, initial[0].newValue);
  assert.equal(cancelled[0].newValue, null);
  assert.equal(cancelled[0].actorLogin, "MANAGER");
  const summary = requestTimelineEvents(later, history).find(event => event.event === "idealRequestedAt");
  assert.equal(summary.eventAt, reopened[0].newValue);
  assert.equal(summary.recordedAt, reopened[0].recordedAt);
  assert.equal(history.length, 3);
  assert.equal(history[0].newValue, iso(idle.idealRequestedAt));
});
