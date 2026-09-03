import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { visibleInMaintenanceHistory } from "../src/maintenance-history.mjs";

test("maintenance history hides only closed requests by the specified closers", () => {
  for (const closedBy of ["Anoop Paul", "maimaintenance manager", " ANOOP PAUL ", "Sanskar Manohare", " SANSKAR MANOHARE "]) {
    const row = Object.freeze({status: "Closed", closedBy, owner: "Other creator"});
    assert.equal(visibleInMaintenanceHistory(row), false);
    for (const status of ["Open", "In progress", "Idle"]) {
      assert.equal(visibleInMaintenanceHistory({...row, status}), true);
    }
  }
  for (const closedBy of ["Sanskar Manohare Other", "SUNIL KUMAR MAHATO", "", "Anoop Paul Other"]) {
    assert.equal(visibleInMaintenanceHistory({status: "Closed", closedBy, owner: "Anoop Paul"}), true);
  }
  assert.equal(visibleInMaintenanceHistory({}), true);
});

test("maintenance exclusion is wired only into maintenance closed history", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /const historyRows=isMis\?[^;]+:isMaintenance\?closedRequests\.filter\(visibleInMaintenanceHistory\):closedRequests;/);
  assert.equal((source.match(/filter\(visibleInMaintenanceHistory\)/g) || []).length, 1);
});
