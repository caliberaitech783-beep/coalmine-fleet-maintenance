import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("Maintenance Closed History gives Closing Time the Days of BD sort menu", () => {
  assert.match(source, /function MobileWorkflowTable\(\{ closedTimeAfterStarted = false, closingTimeSortMenu = false,/);
  assert.match(source, /durationSortOnly=\{key === "closedAt" && closingTimeSortMenu \? true : undefined\}/);
  assert.match(source, /tab === "history"[\s\S]*closingTimeSortMenu=\{isMaintenance\}/);
});
