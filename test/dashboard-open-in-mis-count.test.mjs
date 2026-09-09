import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("Open in MIS uses the maintenance-closed requests awaiting verification", () => {
  assert.match(source, /mis: maintenanceClosedRows\.length/);
  assert.doesNotMatch(source, /mis: Math\.max\(0, requestLifecycleRows\.closed\.length - requestLifecycleRows\.verified\.length\)/);
});
