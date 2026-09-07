import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("production request table follows the approved column order", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /const PRODUCTION_REQUEST_COLUMNS = \["door", "equipment", "model", "site", "breakdownDays", "category", "complaint", "start", "status", "dailyRemarks", "ref", "createdBy"\];/);
  assert.match(source, /exportTitle = "Breakdown report", columnOrder = null \}\) \{/);
  assert.match(source, /orderedColumns = columnOrder \? \[\.\.\.columns\.filter\(\(\[key\]\) => key === "requestAction"\), \.\.\.columnOrder\.map\(\(orderKey\) => columns\.find\(\(\[key\]\) => key === orderKey\)\)\.filter\(Boolean\)\] : columns,/);
  assert.match(source, /filterColumns = orderedColumns\.filter\(/);
  assert.match(source, /\{orderedColumns\.map\(\(\[key, label\]\) => \(/);
  assert.match(source, /\{columnOrder \? orderedColumns\.map\(\(\[key\]\) => <React\.Fragment key=\{key\}>\{breakdownCell\(key, r, \{ showReadOnlyAction, onApproveIdeal, onCancelIdeal \}\)\}<\/React\.Fragment>\) : <>/);
  assert.match(source, /exportTitle=\{workspaceReportTitles\.requests\} showReadOnlyAction showMakeModel showReason showCreatedBy showBreakdownDays columnOrder=\{PRODUCTION_REQUEST_COLUMNS\} \/>/);
});
