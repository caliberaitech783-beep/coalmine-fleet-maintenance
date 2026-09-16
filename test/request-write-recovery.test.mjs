import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

import {requestWriteConnectionMessage, requestWriteOutcomeConfirmed} from "../src/request-write-recovery.mjs";

const before = {ref: "REQ-PHONE", status: "Open", acceptanceRequired: true, acceptedAt: ""};

test("a lost mobile response is treated as success only after the acceptance is visible on a fresh read", () => {
  assert.equal(requestWriteOutcomeConfirmed(before, {...before, acceptedAt: "2026-09-16 17:58:00"}, "edit"), true);
  assert.equal(requestWriteOutcomeConfirmed(before, before, "edit"), false);
  assert.equal(requestWriteOutcomeConfirmed(before, {...before, ref: "REQ-OTHER", acceptedAt: "2026-09-16 17:58:00"}, "edit"), false);
});

test("other workflow writes use their recorded lifecycle evidence", () => {
  assert.equal(requestWriteOutcomeConfirmed(before, {...before, closedAt: "2026-09-16 18:00:00"}, "close"), true);
  assert.equal(requestWriteOutcomeConfirmed(before, {...before, verifiedAt: "2026-09-16 18:05:00"}, "verify"), true);
  assert.equal(requestWriteOutcomeConfirmed(before, {...before, delayedReason: "Parts"}, "delayed-reason", {delayedReason: "Parts"}), true);
  assert.equal(requestWriteOutcomeConfirmed(before, {...before, status: "Open"}, "close"), false);
});

test("the mobile failure keeps the form open with a useful acceptance message instead of a raw browser alert", () => {
  assert.match(requestWriteConnectionMessage(before, "edit"), /phone connection was interrupted/i);
  assert.match(requestWriteConnectionMessage(before, "edit"), /form is still open/i);
  assert.doesNotMatch(requestWriteConnectionMessage(before, "edit"), /Failed to fetch/);
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /const confirmed = await confirmUncertainWrite\(\)/);
  assert.match(source, /catch \(error\) \{ if \(!requireArrivalReason\(editing, error\)\) throw error; \}/);
});
