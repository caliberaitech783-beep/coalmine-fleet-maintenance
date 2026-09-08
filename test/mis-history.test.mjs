import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { visibleInMisRequests, visibleInMisHistory } from "../src/mis-history.mjs";

test("MIS queues use lifecycle state, not the closer, verifier or historical reference", () => {
  for (const closedBy of ["Anoop Paul", "maimaintenance manager", "Sanskar Manohare", "Other closer"]) {
    for (const ref of ["REQ-1787759984730", "REQ-NEW-PRODUCTION-CYCLE"]) {
      const row = Object.freeze({status: " Closed ", ref, closedBy, owner: "Stupal Moon"});
      assert.equal(visibleInMisRequests(row), true);
      assert.equal(visibleInMisHistory(row), false);
      assert.equal(visibleInMisRequests({...row, verifiedAt: "  "}), true);
      for (const verifiedBy of ["Damini Rai", "Other verifier"]) {
        const verified = {...row, verifiedBy, verifiedAt: "2026-09-08 14:00:00"};
        assert.equal(visibleInMisRequests(verified), false);
        assert.equal(visibleInMisHistory(verified), true);
      }
    }
  }
});

test("open, in-progress and pending idle approvals do not enter either MIS queue", () => {
  for (const status of ["Open", "In progress", "Awaiting parts", "Idle", "Ideal", ""]) {
    for (const visible of [visibleInMisRequests, visibleInMisHistory]) {
      assert.equal(visible({status}), false);
    }
  }
});

test("MIS queue and history consume the state predicates", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /isMis \? closedRequests\.filter\(visibleInMisRequests\) : activeRequests/);
  assert.match(source, /historyRows=isMis\?closedRequests\.filter\(visibleInMisHistory\):isProduction/);
});
