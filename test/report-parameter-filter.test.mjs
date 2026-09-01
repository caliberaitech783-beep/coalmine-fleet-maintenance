import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("report views expose parameter filters through the report actions control", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const breakdown = source.slice(source.indexOf("function BreakdownTable"), source.indexOf("const masterFields"));
  const reportTable = source.slice(source.indexOf("function ReportTable"), source.indexOf("function parseCsv"));
  const mobileWorkflow = source.slice(source.indexOf("function MobileWorkflowTable"), source.indexOf("function RequestEditForm"));

  assert.match(source, /function TableParameterFilter\(/);
  assert.match(source, /aria-label="Filter report parameters"/);
  assert.match(source, /function tableRowMatchesFilters\(/);
  assert.match(breakdown, /<TableParameterFilter columns=\{filterColumns\}/);
  assert.match(breakdown, /tableRowMatchesFilters\(row, filterColumns, parameterFilters\)/);
  assert.match(mobileWorkflow, /<TableParameterFilter columns=\{filterColumns\}/);
  assert.match(mobileWorkflow, /tableRowMatchesFilters\(row, filterColumns, parameterFilters\)/);
  assert.doesNotMatch(reportTable, /All statuses/);
  assert.match(reportTable, /<ReportActionsMenu/);
  assert.match(reportTable, /aria-label="Rows per page"/);
  assert.match(reportTable, /<TableParameterFilter columns=\{columns\}/);
  assert.match(reportTable, /hideTrigger dialogMode/);
});
