import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { visibleInOperationalUserRequests } from "../src/operational-user-request-visibility.mjs";

test("operational user workspaces hide only the two specified requests", () => {
  for (const ref of ["REQ-1788429762428", " req-1788428319118 "]) {
    const row = Object.freeze({ref, door:"Unrelated"});
    assert.equal(visibleInOperationalUserRequests(row), false);
    assert.equal(row.ref, ref);
  }
  assert.equal(visibleInOperationalUserRequests({reference:"REQ-1788429762428"}), false);
  assert.equal(visibleInOperationalUserRequests({ref:" ", reference:"REQ-1788428319118"}), false);
  for (const ref of ["REQ-1788429762429", "REQ-1788428319119", "", undefined]) {
    assert.equal(visibleInOperationalUserRequests({ref, door:"V257 - MH34BZ5560"}), true);
  }
});

test("filter is applied once before all Production, Maintenance, and MIS user queues", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /const requestRows=requests\.map\(\(request\)=>requestWithEquipmentMasterDetails\(request,equipmentRecords\)\)\.filter\(visibleInOperationalUserRequests\);/);
  assert.equal(source.split("filter(visibleInOperationalUserRequests)").length - 1, 1);
  assert.match(source, /const activeRequests=requestRows\.filter/);
  assert.match(source, /const closedRequests=requestRows\.filter/);
  assert.match(source, /const idleRows=requestRows\.filter/);
});
