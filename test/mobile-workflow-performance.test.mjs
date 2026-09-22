import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("mobile workflow tables render large result sets in batches", () => {
  assert.match(source, /const WORKFLOW_INITIAL_RENDER_ROWS = 100;/);
  assert.match(source, /const WORKFLOW_RENDER_BATCH = 100;/);
  assert.match(source, /const visibleWorkflowRows = sortedRows\.slice\(0, visibleRowLimit\);/);
  assert.match(source, /visibleWorkflowRows\.map\(\(row\) =>/);
  assert.match(source, /Show next \{Math\.min\(WORKFLOW_RENDER_BATCH, remainingWorkflowRows\)\}/);
});

test("mobile workflow print and export still use every filtered row", () => {
  assert.match(source, /<PrintButton title=\{exportTitle\} columns=\{filterColumns\} rows=\{sortedRows\}/);
  assert.match(source, /<ExportMenu title=\{exportTitle\} columns=\{filterColumns\} rows=\{sortedRows\}/);
});
