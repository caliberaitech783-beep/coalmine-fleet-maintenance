import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("Open in Maint equals the active non-closed opened count", () => {
  assert.match(source, /maintenance: requestLifecycleRows\.opened\.length/);
  assert.doesNotMatch(source, /maintenance: Math\.max\(0, requestLifecycleRows\.opened\.length - requestLifecycleRows\.closed\.length\)/);
});
