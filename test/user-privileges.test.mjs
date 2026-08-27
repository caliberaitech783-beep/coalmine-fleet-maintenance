import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {resolveMobileAccess} from "../mobile-access.mjs";

test("user creation contains every existing privilege option", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /const userPrivilegeFields = \[[\s\S]*"userGroup"[\s\S]*"read"[\s\S]*"edit"[\s\S]*"delete"[\s\S]*"verify"[\s\S]*"print"/);
  assert.doesNotMatch(source.match(/function UserPrivilegeFields[\s\S]*?\n}/)?.[0] || "", /Privilege location|name="location"/);
  assert.doesNotMatch(source.match(/function UserPrivilegeFields[\s\S]*?\n}/)?.[0] || "", /accessType|Desktop User \/ Mobile User/);
  assert.match(source, /<h3>Additional privileges<\/h3>/);
  assert.match(source, /formFields = name === "Users & employees" \? \[\.\.\.fields, \.\.\.userPrivilegeFields, \.\.\.userSubmenuFields\]/);
});

test("user modal uses one role selector with role-specific sections", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /const accountRoleOptions = \["User", \.\.\.mobileUserRoleOptions\]/);
  assert.match(source, /Manager User[\s\S]*Team User/);
  assert.match(source, /roleSection === "manager"[\s\S]*name="userGroup" value="User"/);
  assert.match(source, /option === "Manager" \? "Non Admin" : option/);
  assert.match(source, /roleSection === "team"[\s\S]*mobileUserRoleOptions\.map[\s\S]*type="radio" name="userGroup"/);
  assert.match(source, /const userAuthorityOptions = \["Admin", "Manager"\]/);
  assert.match(source, /type="radio" name="adminLevel"/);
  assert.match(source, /const managerRoleOptions = \["Production Manager", "Maintenance Manager", "MIS Manager"\]/);
  assert.match(source, /managerRoleOptions\.map[\s\S]*type="checkbox" name="managerRole"/);
  assert.match(source, /Consolidated WhatsApp report regions[\s\S]*MANAGER_REGION_OPTIONS\.map[\s\S]*name="managerRegion"/);
  assert.match(source, /accountRole && \(!isDesktopUser \|\| isManager\) && <label>Location \*[\s\S]*name="site"/);
  assert.match(source, /accountRole && !isDesktopUser && <UserPrivilegeFields/);
  assert.match(source, /isAdmin && <div className="super-role-summary full"/);
  assert.match(source, /isDesktopUser && <>[\s\S]*Selected menus for each view/);
  assert.match(source, /accountRole && !isDesktopUser && <>[\s\S]*OperationalViewMenuFields/);
  assert.match(source, /desktopUserMenuAccess[\s\S]*mobileUserMenuAccess/);
  assert.match(source, /showRequestsMenu&&canCreate&&canSeeRequestMenu\("Create request"\)/);
  assert.match(source, /\["site", "userType", "masterAccess", "tabAccess"\]\.includes\(key\)/);
});

test("manager profile and navigation honor assigned role, location, and parent menu access", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /permissions\.managerRoles\?\.join\(" · "\)/);
  assert.match(source, /session\?\.name[\s\S]*profileLocation[\s\S]*\.join\(" · "\)/);
  assert.match(source, /accessAllows\(viewPermissions\.tabAccess, "Masters"\)[\s\S]*visibleMasterNav\.length > 0/);
  assert.match(source, /accessAllows\(activeNavigationPermissions\.tabAccess, "Masters"\) && accessAllows\(activeNavigationPermissions\.masterAccess, name\)/);
});

test("each Manager receives a role-specific dashboard", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /function ManagerDashboard/);
  assert.match(source, /Production Manager[\s\S]*On road[\s\S]*Off road/);
  assert.match(source, /Maintenance Manager[\s\S]*Received for maintenance[\s\S]*Remaining/);
  assert.match(source, /MIS Manager[\s\S]*Pending verification[\s\S]*Verified/);
  assert.match(source, /adminPermissions\.adminLevel === "Manager"[\s\S]*<ManagerDashboard/);
});

test("Admin is automatically assigned every menu and submenu", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const defaults = source.match(/function applyUserRoleDefaults[\s\S]*?\n}/)?.[0] || "";
  assert.match(defaults, /role === "User"/);
  assert.match(defaults, /record\.adminLevel === "Admin"/);
  assert.match(defaults, /record\.masterAccess = ADMIN_MASTER_OPTIONS\.join/);
  assert.match(defaults, /record\.tabAccess = ADMIN_TAB_OPTIONS\.join/);
  assert.match(defaults, /Object\.values\(ADMIN_SUBMENU_OPTIONS\)/);
});

test("persisted user privileges override legacy separate privilege rows", () => {
  const profile = resolveMobileAccess({
    user: {userType: "Mobile User", userGroup: "Maintenance User", delete: false},
    privilege: {userGroup: "Production User", delete: true},
  });
  assert.equal(profile.assignedRole, "Maintenance User");
  assert.equal(profile.permissions.deleteRequests, false);
});

test("Privilege is no longer a separate header submenu", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const masterNavigation = source.match(/const masterNav = \[[\s\S]*?\];/)?.[0] || "";
  assert.doesNotMatch(masterNavigation, /Privilege/);
});
