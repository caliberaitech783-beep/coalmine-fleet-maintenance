import test from "node:test";
import assert from "node:assert/strict";
import { mergePrivilegeRecords, privilegeEnabled } from "../privilege-record.mjs";

test("keeps selected privilege role and site as strings", () => {
  const merged = mergePrivilegeRecords(
    { accessType: "Mobile User", location: "Sasti OB", userGroup: "Maintenance User" },
    { accessType: true, location: false, userGroup: "" },
  );
  assert.equal(merged.accessType, "Mobile User");
  assert.equal(merged.location, "Sasti OB");
  assert.equal(merged.userGroup, "Maintenance User");
});

test("uses a later valid selection when a legacy privilege value is boolean", () => {
  const merged = mergePrivilegeRecords(
    { accessType: false, location: true },
    { accessType: "Super User", location: "Jayant OB 2nd" },
  );
  assert.equal(merged.accessType, "Super User");
  assert.equal(merged.location, "Jayant OB 2nd");
});

test("ignores legacy checkbox strings when selecting a privilege role or site", () => {
  const merged = mergePrivilegeRecords(
    { accessType: "true", location: "false", userGroup: "no" },
    { accessType: "Super User", location: "Dudhichua East OB", userGroup: "MIS User" },
  );
  assert.equal(merged.accessType, "Super User");
  assert.equal(merged.location, "Dudhichua East OB");
  assert.equal(merged.userGroup, "MIS User");
});

test("merges only permission columns as enabled flags", () => {
  const merged = mergePrivilegeRecords(
    { read: false, edit: "yes", delete: false, verify: false, print: false },
    { read: "true", edit: false, delete: "1", verify: "checked", print: "no" },
  );
  assert.deepEqual(
    Object.fromEntries(["read", "edit", "delete", "verify", "print"].map((key) => [key, merged[key]])),
    { read: true, edit: true, delete: true, verify: true, print: false },
  );
  assert.equal(privilegeEnabled("false"), false);
});
