import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("report views expose a visible all-parameter filter beside status controls", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const breakdown = source.slice(source.indexOf("function BreakdownTable"), source.indexOf("const masterFields"));
  const reportTable = source.slice(source.indexOf("function ReportTable"), source.indexOf("function parseCsv"));
  const mobileWorkflow = source.slice(source.indexOf("function MobileWorkflowTable"), source.indexOf("function RequestEditForm"));

  assert.match(source, /function TableParameterFilter\(/);
  assert.match(source, /aria-label="Filter report parameters"/);
  assert.match(source, /const \[valueSearches, setValueSearches\] = useState\(\{\}\);/);
  assert.match(source, /placeholder=\{`Search \$\{column\.label\}`\}/);
  assert.match(source, /matchesSmartSearch\(valueSearches\[column\.key\] \|\| "", value\)/);
  assert.match(source, /function tableRowMatchesFilters\(/);
  assert.match(breakdown, /<TableParameterFilter columns=\{filterColumns\}/);
  assert.match(breakdown, /tableRowMatchesFilters\(row, filterColumns, parameterFilters\)/);
  assert.match(mobileWorkflow, /<TableParameterFilter columns=\{filterColumns\}/);
  assert.match(mobileWorkflow, /tableRowMatchesFilters\(row, filterColumns, parameterFilters\)/);
  assert.match(reportTable, /All statuses/);
  assert.match(reportTable, /<TableParameterFilter columns=\{columns\}/);
});
