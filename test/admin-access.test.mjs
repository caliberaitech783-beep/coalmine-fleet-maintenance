import test from "node:test";
import assert from "node:assert/strict";
import {ADMIN_MASTER_OPTIONS, accessAllows, adminAccessPermissions} from "../admin-access.mjs";

test("legacy administrators retain full access when allowlists are absent", () => {
  const permissions = adminAccessPermissions({userType: "Super Admin"});
  assert.equal(permissions.masterAccess, null);
  assert.equal(permissions.tabAccess, null);
  assert.equal(accessAllows(permissions.masterAccess, "Equipment master"), true);
});

test("new administrators receive only explicitly selected masters and tabs", () => {
  const permissions = adminAccessPermissions({
    masterAccess: "Equipment master | Region master",
    tabAccess: "Audit Trail",
  });
  assert.deepEqual(permissions.masterAccess, ["Equipment master", "Region master"]);
  assert.deepEqual(permissions.tabAccess, ["Audit Trail"]);
  assert.equal(accessAllows(permissions.masterAccess, "OEM master"), false);
  assert.equal(ADMIN_MASTER_OPTIONS.includes("Privilege"), true);
});
