import assert from "node:assert/strict";
import test from "node:test";
import { GLOBALLY_HIDDEN_REQUEST_OWNERS, GLOBAL_REQUEST_OWNER_HIDE_CUTOFF, MIS_HIDDEN_REQUEST_REFERENCES, requestsVisibleGlobally, requestsVisibleToMisWorkspace, requestsVisibleToSession } from "../mis-request-visibility.mjs";

const rows = [
  { ref: "REQ-1787994776734" },
  { ref: "REQ-1787994588710" },
  { ref: "REQ-1787759984730" },
  { ref: "REQ-KEEP-VISIBLE" },
];

test("only the three specified requests are hidden from MIS users", () => {
  assert.equal(MIS_HIDDEN_REQUEST_REFERENCES.size, 3);
  assert.deepEqual(
    requestsVisibleToSession(rows, { role: "normal", assignedRole: "MIS User" }),
    [{ ref: "REQ-KEEP-VISIBLE" }],
  );
});

test("the same requests remain visible to every other role", () => {
  for (const session of [
    { role: "normal", assignedRole: "Production User" },
    { role: "normal", assignedRole: "Maintenance User" },
    { role: "super", assignedRole: "MIS User", permissions: { adminLevel: "Manager" } },
  ]) assert.deepEqual(requestsVisibleToSession(rows, session), rows);
});

test("an embedded MIS workspace also hides the selected requests for an administrator", () => {
  assert.deepEqual(requestsVisibleToMisWorkspace(rows, true), [{ ref: "REQ-KEEP-VISIBLE" }]);
  assert.deepEqual(requestsVisibleToMisWorkspace(rows, false), rows);
});

test("Stupal Moon requests are hidden from every authenticated role", () => {
  const ownerRows = [
    { ref: "REQ-HIDE-STUPAL", owner: " Stupal Moon ", createdAt: GLOBAL_REQUEST_OWNER_HIDE_CUTOFF },
    { ref: "REQ-KEEP-OTHER", owner: "Other User", createdAt: "2026-09-01 10:00:00" },
  ];
  assert.deepEqual([...GLOBALLY_HIDDEN_REQUEST_OWNERS], ["stupal moon"]);
  assert.deepEqual(requestsVisibleGlobally(ownerRows), [ownerRows[1]]);
  for (const session of [
    { role: "normal", assignedRole: "Production User" },
    { role: "normal", assignedRole: "Maintenance User" },
    { role: "normal", assignedRole: "MIS User" },
    { role: "super", permissions: { adminLevel: "Manager" } },
    { role: "super", permissions: { adminLevel: "Admin" } },
  ]) assert.deepEqual(requestsVisibleToSession(ownerRows, session), [ownerRows[1]]);
});

test("new Stupal Moon requests remain visible everywhere", () => {
  const newRequest = { ref: "REQ-NEW-STUPAL", owner: "Stupal Moon", createdAt: "2026-09-09 18:24:45" };
  const futureRequest = { ref: "REQ-FUTURE-STUPAL", owner: "Stupal Moon", createdAt: "2026-09-10 09:00:00" };
  const legacyWithoutCreationTime = { ref: "REQ-NO-CREATED-AT", owner: "Stupal Moon" };
  assert.deepEqual(requestsVisibleGlobally([newRequest, futureRequest, legacyWithoutCreationTime]), [newRequest, futureRequest, legacyWithoutCreationTime]);
});
