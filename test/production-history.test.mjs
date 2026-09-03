import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { visibleInProductionHistory } from "../src/production-history.mjs";

test("production history hides only closed requests matching both name lists", () => {
  for (const owner of ["stupal moon", "Sanskar Manohare"]) {
    for (const closedBy of ["maimaintenance manager", "Anoop Paul"]) {
      const row = Object.freeze({owner, closedBy, status: "Closed"});
      assert.equal(visibleInProductionHistory(row), false);
      assert.equal(visibleInProductionHistory({...row, owner: "Other creator"}), true);
      assert.equal(visibleInProductionHistory({...row, closedBy: "Other closer"}), true);
      assert.equal(visibleInProductionHistory({...row, status: "Open"}), true);
    }
  }
  assert.equal(visibleInProductionHistory({owner: " STUPAL MOON ", closedBy: " ANOOP PAUL ", status: "Closed"}), false);
  assert.equal(visibleInProductionHistory({}), true);
});

test("the two additional shown requests are hidden without hiding other Sanskar closures", () => {
  for (const complaint of ["gjkh", "The card is broken."]) {
    const row = {status: "Closed", owner: "stupal moon", closedBy: "Sanskar Manohare", complaint};
    assert.equal(visibleInProductionHistory(row), false);
    assert.equal(visibleInProductionHistory({...row, owner: "RAKESH KUMAR SINGH"}), true);
    assert.equal(visibleInProductionHistory({...row, owner: "ARUN YADAV"}), true);
    assert.equal(visibleInProductionHistory({...row, status: "Open"}), true);
    assert.equal(visibleInProductionHistory({...row, complaint: "Unrelated request"}), true);
  }
});

test("exclusion is applied only to Production User history, not other queues", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /historyRows=isMis\?closedRequests\.filter\(\(row\)=>Boolean\(row\.verifiedAt\)\):isProduction\?closedRequests\.filter\(visibleInProductionHistory\):isMaintenance\?closedRequests\.filter\(visibleInMaintenanceHistory\):closedRequests/);
  assert.equal((source.match(/filter\(visibleInProductionHistory\)/g) || []).length, 1);
});
