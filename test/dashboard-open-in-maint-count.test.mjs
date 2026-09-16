import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("Open in Maint equals the active non-closed, non-idle opened count", () => {
  assert.match(source, /maintenance: requestLifecycleRows\.opened\.length/);
  assert.doesNotMatch(source, /maintenance: Math\.max\(0, requestLifecycleRows\.opened\.length - requestLifecycleRows\.closed\.length\)/);
});

test("Open in Maint rows exclude both idle spellings while preserving active statuses and dates", () => {
  const expression = source.match(/opened: locationBreakdowns\.filter\((\(record\) => .*?)\),\r?\n/)[1];
  const predicate = new Function("requestEventDate", "safeTrendStartKey", "requestTrendEndKey", `return ${expression}`)(
    (record) => record.date, "2026-09-16", "2026-09-16",
  );
  for (const status of ["Open", "Accepted", "In progress"]) {
    assert.equal(predicate({ status, date: "2026-09-16" }), true);
  }
  for (const status of ["Closed", "Idle", "Ideal", " IDLE "]) {
    assert.equal(predicate({ status, date: "2026-09-16" }), false);
  }
  assert.equal(predicate({ status: "Open", date: "2026-09-15" }), false);
  assert.equal(predicate({ status: "Open", date: "2026-09-17" }), false);
  assert.match(source, /const rows = event === "closed" && !date \? maintenanceClosedRows : requestLifecycleRows\[event\] \|\| \[\]/);
});
