import assert from "node:assert/strict";
import test from "node:test";
import { visibleInProductionHistory } from "../src/production-history.mjs";

test("every authorized closed production request stays visible regardless of creator, closer or complaint", () => {
  for (const owner of ["Stupal Moon", "Sanskar Manohare", "Other creator"]) {
    for (const closedBy of ["maimaintenance manager", "Anoop Paul", "Sanskar Manohare", "Other closer"]) {
      for (const complaint of ["gjkh", "The card is broken.", "Normal maintenance"]) {
        const row = Object.freeze({owner, closedBy, complaint, status: " Closed "});
        assert.equal(visibleInProductionHistory(row), true);
        assert.equal(visibleInProductionHistory({...row, verifiedAt: "2026-09-08 14:00:00"}), true);
        for (const status of ["Open", "In progress", "Idle", "Ideal"]) {
          assert.equal(visibleInProductionHistory({...row, status}), false);
        }
      }
    }
  }
});
