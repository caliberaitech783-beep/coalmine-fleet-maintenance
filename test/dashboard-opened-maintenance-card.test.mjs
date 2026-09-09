import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("request lifecycle shows active requests opened by Maintenance across sites", () => {
  assert.match(source, /openedByMaintenance = \(record\).*=== "maintenance user"/);
  assert.match(source, /openedMaintenance: locationBreakdowns\.filter\(\(record\) => openedByMaintenance\(record\) && activeLifecycleRequest\(record\)/);
  assert.match(source, /key: "openedMaintenance", label: "Opened by Maintenance", note: "Maintenance user requests"/);
  assert.match(source, /lifecycleDrilldownParts\[1\] === "openedMaintenance" \? "Opened by Maintenance requests"/);
});
