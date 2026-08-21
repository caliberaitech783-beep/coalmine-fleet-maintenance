import test from "node:test";
import assert from "node:assert/strict";
import {ADMIN_MASTER_OPTIONS, ADMIN_SUBMENU_OPTIONS, accessAllows, adminAccessPermissions, navigationPermissionsForView} from "../admin-access.mjs";

test("legacy administrators retain full access when allowlists are absent", () => {
  const permissions = adminAccessPermissions({userType: "Super Admin"});
  assert.equal(permissions.adminLevel, "Admin");
  assert.equal(permissions.masterAccess, null);
  assert.equal(permissions.tabAccess, null);
  assert.equal(accessAllows(permissions.masterAccess, "Equipment master"), true);
});

test("manager authority is retained in the admin session permissions", () => {
  const permissions = adminAccessPermissions({adminLevel: "Manager", managerRole: "Maintenance Manager", tabAccess: "Dashboard"});
  assert.equal(permissions.adminLevel, "Manager");
  assert.equal(permissions.managerRole, "Maintenance Manager");
  assert.deepEqual(permissions.tabAccess, ["Dashboard", "Tickets"]);
});

test("desktop and mobile menu selections remain independent per user",()=>{
  const permissions=adminAccessPermissions({adminLevel:"Manager",tabAccess:"Dashboard | Tickets",masterAccess:"Equipment master",mobileTabAccess:"Masters | Tickets",mobileMasterAccess:"Region master",mobileDashboardAccess:"",mobileTicketAccess:"Tickets"});
  assert.deepEqual(permissions.tabAccess,["Dashboard","Tickets"]);
  assert.deepEqual(permissions.mobileTabAccess,["Masters","Tickets"]);
  assert.deepEqual(navigationPermissionsForView(permissions,false).masterAccess,["Equipment master"]);
  assert.deepEqual(navigationPermissionsForView(permissions,true).masterAccess,["Region master"]);
});

test("every main header has a conditional submenu allowlist", () => {
  assert.deepEqual(Object.keys(ADMIN_SUBMENU_OPTIONS), ["Dashboard", "Masters", "WhatsApp Integration", "Reports", "Audit Trail", "Tickets"]);
  assert.ok(Object.values(ADMIN_SUBMENU_OPTIONS).every(({field, options}) => field && options.length));
});

test("new administrators receive only explicitly selected masters and tabs", () => {
  const permissions = adminAccessPermissions({
    masterAccess: "Equipment master | Region master",
    tabAccess: "Audit Trail",
  });
  assert.deepEqual(permissions.masterAccess, ["Equipment master", "Region master"]);
  assert.deepEqual(permissions.tabAccess, ["Audit Trail"]);
  assert.equal(accessAllows(permissions.masterAccess, "OEM master"), false);
  assert.equal(ADMIN_MASTER_OPTIONS.includes("Privilege"), false);
});
