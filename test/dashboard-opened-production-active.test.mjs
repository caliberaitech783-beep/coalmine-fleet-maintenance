import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("Opened by Production excludes maintenance-closed requests", () => {
  assert.match(source, /opened: locationBreakdowns\.filter\(\(record\) => openedByProduction\(record\) && !requestEventDate\(record, "closed"\) && String\(record\.status \|\| ""\)\.trim\(\)\.toLowerCase\(\) !== "closed"/);
});
