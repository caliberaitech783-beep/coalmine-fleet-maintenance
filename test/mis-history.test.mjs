import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { visibleInMisRequests, visibleInMisHistory } from "../src/mis-history.mjs";

test("MIS request queue hides the specified closers without changing records", () => {
  for (const closedBy of ["Anoop Paul", "maimaintenance manager", "Sanskar Manohare", " ANOOP PAUL "]) {
    assert.equal(visibleInMisRequests(Object.freeze({status: "Closed", closedBy})), false);
  }
  assert.equal(visibleInMisRequests({status: "Closed", closedBy: "Other", owner: "Anoop Paul", verifiedBy: "Damini Rai"}), true);
});

test("MIS history hides either specified closer or verifier independently", () => {
  for (const closedBy of ["maimaintenance manager", "Sanskar Manohare", " SANSKAR MANOHARE "]) {
    assert.equal(visibleInMisHistory(Object.freeze({status: "Closed", closedBy, verifiedBy: "Other"})), false);
  }
  for (const closedBy of ["Other", "Anoop Paul"]) {
    assert.equal(visibleInMisHistory({status: "Closed", closedBy, verifiedBy: " DAMINI RAI "}), false);
    assert.equal(visibleInMisHistory({status: "Closed", closedBy, verifiedBy: "Other"}), true);
  }
});

test("MIS exclusions preserve unrelated names and non-closed requests", () => {
  for (const visible of [visibleInMisRequests, visibleInMisHistory]) {
    assert.equal(visible({}), true);
    for (const status of ["Open", "In progress", "Idle"]) {
      assert.equal(visible({status, closedBy: "Sanskar Manohare", verifiedBy: "Damini Rai"}), true);
    }
    for (const closedBy of ["SUNIL KUMAR MAHATO", "Sanskar Manohare Other", "", undefined]) {
      assert.equal(visible({status: "Closed", closedBy, verifiedBy: "Damini Rai Other"}), true);
    }
  }
});

test("MIS exclusions are scoped to the existing request and verified history queues", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /isMis \? closedRequests\.filter\(\(row\) => !row\.verifiedAt\)\.filter\(visibleInMisRequests\) : activeRequests/);
  assert.match(source, /historyRows=isMis\?closedRequests\.filter\(\(row\)=>Boolean\(row\.verifiedAt\)\)\.filter\(visibleInMisHistory\):isProduction/);
  for (const helper of ["visibleInMisRequests", "visibleInMisHistory"]) {
    assert.equal(source.split(`filter(${helper})`).length - 1, 1);
  }
});
