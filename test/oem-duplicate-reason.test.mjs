import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("OEM tables retain the shared breakdown reason without an extra duplicate reason", () => {
  const oem = readFileSync(new URL("../src/oem-breakdown-details.jsx", import.meta.url), "utf8");
  const browser = readFileSync(new URL("../src/dashboard-record-browser.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(oem, /key:\s*"reason",\s*label:\s*"Reason"/);
  assert.match(browser, /<th>Breakdown reason<\/th>/);
  assert.match(browser, /record\.breakdownReason \|\| "—"/);
  assert.match(oem, /key: "idleReason", label: "Idle reason"/);
});
