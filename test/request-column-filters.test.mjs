import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production, maintenance, and MIS request tables use header filter popovers", async () => {
  const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  const breakdownTable = source.slice(source.indexOf("function BreakdownTable"), source.indexOf("const masterFields"));
  const workflowTable = source.slice(source.indexOf("function MobileWorkflowTable"), source.indexOf("function RequestEditForm"));

  assert.match(breakdownTable, /<FilterableHeader key=\{key\}/);
  assert.match(workflowTable, /const workflowHeader = \(key, label\) => <FilterableHeader/);
  assert.match(workflowTable, /workflowHeader\("breakdownDays", "Days of breakdown"\)/);
  assert.match(workflowTable, /workflowHeader\("dailyRemarks", "Daily remarks"\)/);
  assert.match(source, /isProduction && tab === "requests"[\s\S]*<BreakdownTable rows=\{activeRequests\}/);
  assert.match(source, /isMaintenance && tab === "requests"[\s\S]*<MobileWorkflowTable rows=\{activeRequests\}/);
  assert.match(source, /isMis && tab === "requests"[\s\S]*<MobileWorkflowTable rows=\{visibleRows\}/);
  assert.match(source, /tab === "history"[\s\S]*<BreakdownTable rows=\{historyRows\}[\s\S]*<MobileWorkflowTable rows=\{historyRows\}/);
});
