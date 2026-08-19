import assert from "node:assert/strict";
import test from "node:test";
import {loginRecordCandidates, resolveMobileAccess, normalizeMobileUserRole} from "../mobile-access.mjs";

test("login candidate filtering avoids scanning unrelated employee hashes", () => {
  const rows = [
    {record_data: {login: "alice", employee: "Alice Smith"}},
    {record_data: {login: "bob", employee: "Bob Jones"}},
    {record_data: {employee: "Charlie Brown"}},
  ];
  assert.deepEqual(loginRecordCandidates(rows, "alice"), [rows[0]]);
  assert.deepEqual(loginRecordCandidates(rows, "charlie"), [rows[2]]);
  assert.deepEqual(loginRecordCandidates(rows, "missing"), []);
});

test("recognizes only the requested Mobile User groups", () => {
  assert.equal(normalizeMobileUserRole("Production User"), "Production User");
  assert.equal(normalizeMobileUserRole("Maintenance user"), "Maintenance User");
  assert.equal(normalizeMobileUserRole("MIS"), "MIS User");
  assert.equal(normalizeMobileUserRole("Maintenance Head"), "");
});

test("Production User can create requests", () => {
  const profile = resolveMobileAccess({user: {userType: "Mobile User"}, privilege: {userGroup: "Production User"}});
  assert.equal(profile.permissions.createRequests, true);
  assert.equal(profile.permissions.editRequests, false);
  assert.equal(profile.permissions.verifyRequests, false);
});

test("Maintenance actions use the assigned edit and delete permissions", () => {
  const profile = resolveMobileAccess({
    user: {userType: "Mobile User"},
    privilege: {userGroup: "Maintenance User", edit: true, delete: "yes"},
  });
  assert.equal(profile.permissions.createRequests, true);
  assert.equal(profile.permissions.viewEquipment, true);
  assert.equal(profile.permissions.closeRequests, true);
  assert.equal(profile.permissions.editRequests, true);
  assert.equal(profile.permissions.deleteRequests, true);
});

test("MIS can verify but cannot create or maintain requests", () => {
  const profile = resolveMobileAccess({user: {userType: "Mobile User"}, privilege: {userGroup: "MIS User"}});
  assert.equal(profile.permissions.verifyRequests, true);
  assert.equal(profile.permissions.createRequests, false);
  assert.equal(profile.permissions.closeRequests, false);
});
