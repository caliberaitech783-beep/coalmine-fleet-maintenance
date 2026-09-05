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
  assert.match(workflowTable, /showMakeModel && <>\{workflowHeader\("make", "Make"\)\}\{workflowHeader\("model", "Model"\)\}<\/>/);
  assert.match(workflowTable, /showMakeModel && <><td>\{row\.make \|\| "—"\}<\/td><td>\{row\.model \|\| "—"\}<\/td><\/>/);
  assert.match(source, /isProduction && tab === "requests"[\s\S]*<BreakdownTable rows=\{activeRequests\} showReadOnlyAction showMakeModel/);
  assert.match(source, /isMaintenance && tab === "requests"[\s\S]*<MobileWorkflowTable rows=\{activeRequests\} showMakeModel/);
  assert.match(source, /isMaintenance && tab === "close"[\s\S]*showMakeModel/);
  assert.match(source, /isMis && tab === "requests"[\s\S]*<MobileWorkflowTable rows=\{visibleRows\} showMakeModel/);
  assert.match(source, /tab === "idle"[\s\S]*<MobileWorkflowTable rows=\{idleRows\} showMakeModel/);
  assert.match(source, /tab === "history"[\s\S]*<BreakdownTable rows=\{historyRows\}[\s\S]*<MobileWorkflowTable rows=\{historyRows\}/);
});
