import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeAccountType,
  normalizeMobileRole,
  resolveAccessProfile,
  userLoginCandidates,
} from "../access-control.mjs";

test("identifies Super User and Mobile User account types", () => {
  assert.equal(normalizeAccountType("Super Admin"), "super");
  assert.equal(normalizeAccountType("Mobile User"), "mobile");
  assert.equal(normalizeAccountType("employee"), "");
});

test("normalizes every supported Mobile User role", () => {
  assert.equal(normalizeMobileRole("production user"), "Production User");
  assert.equal(normalizeMobileRole("Maintenance Head"), "Maintenance Head");
  assert.equal(normalizeMobileRole("maintenance"), "Maintenance User");
  assert.equal(normalizeMobileRole("MIS"), "MIS User");
});

test("uses a legacy role value when no Privilege role has been configured", () => {
  const profile = resolveAccessProfile({
    user: { userType: "Mobile User", role: "MIS User" },
  });
  assert.equal(profile.assignedRole, "MIS User");
  assert.equal(profile.permissions.viewReports, true);
});

test("Mobile User role policies restrict dashboard actions", () => {
  const production = resolveAccessProfile({
    user: { userType: "Mobile User" },
    privilege: { userGroup: "Production User" },
  });
  assert.equal(production.permissions.createRequest, true);
  assert.equal(production.permissions.viewAllRequests, false);
  assert.equal(production.permissions.viewReports, false);

  const mis = resolveAccessProfile({
    user: { userType: "Mobile User" },
    privilege: { userGroup: "MIS User" },
  });
  assert.equal(mis.permissions.createRequest, false);
  assert.equal(mis.permissions.viewAllRequests, true);
  assert.equal(mis.permissions.viewReports, true);
  assert.equal(mis.permissions.printReports, true);
});

test("selected privilege checkboxes further limit a Mobile role", () => {
  const profile = resolveAccessProfile({
    user: { userType: "Mobile User" },
    privilege: { userGroup: "Maintenance User", read: true, edit: false, print: false },
  });
  assert.equal(profile.permissions.readRequests, true);
  assert.equal(profile.permissions.createRequest, false);
});

test("an edit-only request creator can still select authorized equipment", () => {
  const profile = resolveAccessProfile({
    user: { userType: "Mobile User" },
    privilege: { userGroup: "Production User", read: false, edit: true },
  });
  assert.equal(profile.permissions.readRequests, false);
  assert.equal(profile.permissions.createRequest, true);
  assert.equal(profile.permissions.viewEquipment, true);
});

test("unassigned Mobile Users receive no application capabilities", () => {
  const profile = resolveAccessProfile({ user: { userType: "Mobile User" } });
  assert.equal(profile.assignedRole, "");
  assert.equal(profile.permissions.viewDashboard, false);
});

test("login candidates prioritize configured login and support first-name compatibility", () => {
  assert.deepEqual(userLoginCandidates({ login: "AnupP", employee: "Anoop Paul" }), ["anupp", "anoop"]);
});
