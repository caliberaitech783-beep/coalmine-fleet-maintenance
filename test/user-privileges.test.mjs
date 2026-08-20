import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {resolveMobileAccess} from "../mobile-access.mjs";

test("user creation contains every existing privilege option", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /const userPrivilegeFields = \[[\s\S]*"userGroup"[\s\S]*"location"[\s\S]*"read"[\s\S]*"edit"[\s\S]*"delete"[\s\S]*"verify"[\s\S]*"print"/);
  assert.doesNotMatch(source.match(/function UserPrivilegeFields[\s\S]*?\n}/)?.[0] || "", /accessType|Desktop User \/ Mobile User/);
  assert.match(source, /<h3>Privileges<\/h3>/);
  assert.match(source, /formFields = name === "Users & employees" \? \[\.\.\.fields, \.\.\.userPrivilegeFields, \.\.\.userSubmenuFields\]/);
});

test("user modal sections follow the selected user type", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /userType === "Super Admin"[\s\S]*Visible tabs[\s\S]*visibleTabs\.map\(\(tab\)/);
  assert.match(source, /userType === "Mobile User" && <UserPrivilegeFields/);
  assert.match(source, /visibleTabs\.map\(\(tab\)[\s\S]*ADMIN_SUBMENU_OPTIONS\[tab\]/);
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
