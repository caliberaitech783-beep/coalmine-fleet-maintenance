import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { userMasterRole } from "../src/user-master-role.mjs";

test("User Master displays each saved department manager role", () => {
  for (const managerRole of ["Production Manager", "Maintenance Manager", "MIS Manager"]) {
    const record = Object.freeze({userType:"Super Admin",adminLevel:"Manager",managerRole});
    assert.equal(userMasterRole(record), managerRole);
    assert.equal(record.userType, "Super Admin");
  }
  assert.equal(userMasterRole({userType:"Super Admin",adminLevel:"Manager",managerRole:"Production Manager | MIS Manager | Production Manager"}), "Production Manager | MIS Manager");
});

test("User Master displays specific operational user roles and retains admin authority", () => {
  for (const userGroup of ["Production User", "Maintenance User", "MIS User"]) {
    assert.equal(userMasterRole({userType:"Mobile User",userGroup}), userGroup);
  }
  for (const adminLevel of ["Admin", "Super Admin"]) {
    assert.equal(userMasterRole({userType:"Super Admin",adminLevel,managerRole:"MIS Manager"}), adminLevel);
  }
  assert.equal(userMasterRole({userType:"Super Admin",adminLevel:"Manager"}), "Manager");
  assert.equal(userMasterRole({userType:"Super Admin",managerRole:"Maintenance Manager"}), "Maintenance Manager");
  assert.equal(userMasterRole({userType:"Mobile User",mobileRole:"MIS User"}), "MIS User");
  assert.equal(userMasterRole({userType:"Mobile User",assignedRole:"Production User"}), "Production User");
  assert.equal(userMasterRole({userType:"Super Admin"}), "Super Admin");
  assert.equal(userMasterRole({}), "Not assigned");
});

test("User Master role rendering, filtering, sorting and exports use the same resolver", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /exportColumns = fields\?\.map[^\n]*name === "Users & employees" && key === "userType" \? userMasterRole\(record\)/);
  assert.match(source, /masterValue = \(record, key\) => \{[\s\S]*?if \(name === "Users & employees" && key === "userType"\)\s*return userMasterRole\(record\)/);
  assert.match(source, /useSortableRows\(filteredRows, "", \(record, key\) => \{[^}]*key === "userType"\) return userMasterRole\(record\)/);
  assert.match(source, /const value = name === "Privilege"[^\n]*name === "Users & employees" && key === "userType" \? userMasterRole\(row\) : row\[key\]/);
});
