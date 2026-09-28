import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("Closed lifecycle card and drill-down match graph closures while MIS excludes verified requests", () => {
  assert.match(source, /maintenanceClosedRows = requestLifecycleRows\.closed\.filter\(\(record\) => !requestEventDate\(record, "verified"\)\)/);
  assert.match(source, /key: "closed", label: "Closed", note: "Maintenance completed", value: requestLifecycleRows\.closed\.length/);
  assert.match(source, /const rows = requestLifecycleRows\[event\] \|\| \[\]/);
  assert.match(source, /mis: maintenanceClosedRows\.length/);
});
