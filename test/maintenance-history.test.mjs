import assert from "node:assert/strict";
import test from "node:test";
import { visibleInMaintenanceHistory } from "../src/maintenance-history.mjs";

test("maintenance history shows every closed entry before and after MIS verification", () => {
  for (const closedBy of ["Anoop Paul", "maimaintenance manager", "Sanskar Manohare", "Other closer"]) {
    const row = Object.freeze({status: " Closed ", closedBy, owner: "Stupal Moon"});
    assert.equal(visibleInMaintenanceHistory(row), true);
    assert.equal(visibleInMaintenanceHistory({...row, verifiedAt: "2026-09-08 14:00:00", verifiedBy: "Damini Rai"}), true);
    for (const status of ["Open", "In progress", "Idle", "Ideal"]) {
      assert.equal(visibleInMaintenanceHistory({...row, status}), false);
    }
  }
});
