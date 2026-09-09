import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { visibleInProductionHistory } from "../src/production-history.mjs";
import { visibleInMaintenanceHistory } from "../src/maintenance-history.mjs";
import { visibleInMisRequests, visibleInMisHistory } from "../src/mis-history.mjs";
import { requestsVisibleToMisWorkspace } from "../mis-request-visibility.mjs";

const historyVisible = [visibleInProductionHistory, visibleInMaintenanceHistory];

test("Stupal to Sanskar to manager to MIS cycle never disappears at a handoff", () => {
  const opened = Object.freeze({ref: "REQ-COMPLETE-CYCLE", owner: "Stupal Moon", status: "Open"});
  const accepted = {...opened, status: "In progress", acceptedBy: "Sanskar Manohare", acceptedAt: "2026-09-08 10:10:00"};
  const idle = {...accepted, status: "Idle", closedBy: "Sanskar Manohare", idleReason: "No work"};
  const approved = {...idle, status: "Closed", idealApprovedBy: "maimaintenance manager", idealApprovedAt: "2026-09-08 12:00:00"};
  const verified = {...approved, verifiedBy: "Damini Rai", verifiedAt: "2026-09-08 13:00:00"};
  for (const row of [opened, accepted, idle]) {
    assert.ok(historyVisible.every(visible => !visible(row)));
    assert.equal(visibleInMisRequests(row), false);
    assert.equal(visibleInMisHistory(row), false);
  }
  assert.ok(historyVisible.every(visible => visible(approved)));
  assert.equal(visibleInMisRequests(approved), true);
  assert.equal(visibleInMisHistory(approved), false);
  assert.ok(historyVisible.every(visible => visible(verified)));
  assert.equal(visibleInMisRequests(verified), false);
  assert.equal(visibleInMisHistory(verified), true);
  // A normal maintenance close takes the same handoff without manager approval.
  const directClose = {...accepted, status: "Closed", closedBy: "Sanskar Manohare"};
  assert.ok(historyVisible.every(visible => visible(directClose)));
  assert.equal(visibleInMisRequests(directClose), true);
});

test("persisted historical references follow the explicit MIS exclusions", () => {
  for (const ref of ["REQ-1788429762428", "REQ-1788428319118"]) {
    const row = Object.freeze({ref, status: "Closed", closedBy: "Sanskar Manohare"});
    assert.ok(historyVisible.every(visible => visible(row)));
    assert.equal(visibleInMisRequests(row), true);
  }
  assert.deepEqual(requestsVisibleToMisWorkspace([{ref:"REQ-1787759984730",status:"Closed"}],true),[]);
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /const requestRows=siteRequests\.map\(\(request\)=>requestWithEquipmentMasterDetails\(request,equipmentRecords\)\);/);
  assert.doesNotMatch(source, /visibleInOperationalUserRequests/);
  assert.match(source, /const siteRequests=!embedded&&isMaintenance\?recordsForSite\(requests,assignedLocation\):misWorkspaceRequests;/);
});
