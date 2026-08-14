import assert from "node:assert/strict";
import test from "node:test";
import {resolveMobileAccess, normalizeMobileUserRole} from "../mobile-access.mjs";

test("recognizes only the requested Mobile User groups", () => {
  assert.equal(normalizeMobileUserRole("Production User"), "Production User");
  assert.equal(normalizeMobileUserRole("Maintenance user"), "Maintenance User");
  assert.equal(normalizeMobileUserRole("MIS"), "MIS User");
  assert.equal(normalizeMobileUserRole("Maintenance Head"), "");
});

test("Production User alone can create requests", () => {
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
  assert.equal(profile.permissions.createRequests, false);
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
