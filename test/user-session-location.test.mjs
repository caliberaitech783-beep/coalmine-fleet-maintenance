import assert from "node:assert/strict";
import test from "node:test";
import {userSessionLocationName} from "../site-location.mjs";

test("user session location follows assigned site, manager scope, and admin access", () => {
  assert.equal(userSessionLocationName({site:"Sasti OB",managerSites:"Majri OB"},"Manager"),"Sasti OB");
  assert.equal(userSessionLocationName({managerSites:"Sasti OB | Majri OB"},"Manager"),"Sasti OB | Majri OB");
  assert.equal(userSessionLocationName({managerRegion:"WCL"},"Manager"),"WCL region");
  assert.equal(userSessionLocationName({},"Admin"),"All locations");
  assert.equal(userSessionLocationName({managerRegion:"All"},"Super Admin"),"All locations");
  assert.equal(userSessionLocationName({},"Maintenance User"),"Not assigned");
});

test("administrators and Directors always show all locations", () => {
  assert.equal(userSessionLocationName({site:"Sasti OB",adminLevel:"Admin"},"Admin"),"All locations");
  assert.equal(userSessionLocationName({site:"Majri OB",adminLevel:"Super Admin"},"Super Admin"),"All locations");
  assert.equal(userSessionLocationName({site:"Lalpeth OB",designation:"Director's"},"Manager"),"All locations");
  assert.equal(userSessionLocationName({site:"Dhoptala OB (2nd)",managerRole:"Director"},"Manager"),"All locations");
});
