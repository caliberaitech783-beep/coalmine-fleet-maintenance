import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const shared = readFileSync(new URL("../src/shared-actions-table.jsx", import.meta.url), "utf8");
const workflow = source.slice(source.indexOf("function MobileWorkflowTable"), source.indexOf("function MeterReadingFields"));

test("Maintenance Closed History pages rendered rows without dropping full data operations", () => {
  assert.match(source, /lightweightHistory=\{isMaintenance\}/);
  assert.match(source, /lightweightHistory\s*\? sortedRows\.slice\(workflowPageStart, workflowPageStart \+ WORKFLOW_INITIAL_RENDER_ROWS\)/);
  assert.match(source, /recordCountOverride=\{lightweightHistory \? \{selected: sortedRows\.length, total: rows\.length\} : null\}/);
  assert.match(source, /const deletionRows = sortedRows\.filter/);
  assert.match(source, /<ExportMenu title=\{exportTitle\} columns=\{filterColumns\} rows=\{sortedRows\}/);
  assert.match(shared, /recordCountOverride \? `\$\{recordCountOverride\.selected\} of \$\{recordCountOverride\.total\} records`/);
});

test("Maintenance history pagination preserves every stored row and duplicate", () => {
  assert.doesNotMatch(workflow, /new Map\(|\.findIndex\(/);
  assert.match(source, /workflowPageStart \+ 1\}–\{Math\.min\(workflowPageStart \+ WORKFLOW_INITIAL_RENDER_ROWS, sortedRows\.length\)\} of \{sortedRows\.length\} records/);
});
