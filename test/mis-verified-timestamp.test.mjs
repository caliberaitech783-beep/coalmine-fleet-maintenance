import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("MIS closed history shows the exact verified date and time", () => {
  const table = source.slice(source.indexOf("function MobileWorkflowTable("), source.indexOf("function RequestEditForm("));

  assert.match(table, /showVerifiedAt \? \[\{key: "verifiedAt", label: "Verified date & time", value: \(row\) => formatTwelveHourDateTime\(row\.verifiedAt\)\}\]/);
  assert.match(table, /showVerifiedAt && workflowHeader\("verifiedAt", "Verified date & time"\)/);
  assert.match(table, /showVerifiedAt && <td>\{formatTwelveHourDateTime\(row\.verifiedAt\)\}<\/td>/);
  assert.match(source, /showVerifiedBy=\{isMis\} showVerifiedAt=\{isMis\} showTripCard=\{isMis\}/);
});
