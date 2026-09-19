import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("workspace report names are visible and used by print, PDF, and Excel exports", () => {
  assert.match(source, /requests: isProduction \? "Active Production Requests" : isMaintenance \? "Active Maintenance Requests" : "MIS Requests Awaiting Verification"/);
  assert.match(source, /history: isGeneral \? "Closed Request History" : isProduction \? "Closed Production Requests" : isMaintenance \? "Closed Maintenance Requests" : "Closed MIS Requests"/);
  assert.match(source, /idle: "Idle Vehicles"/);
  assert.match(source, /<h3 className="sectiontitle">\{workspaceReportTitles\.requests\}<\/h3>/);
  assert.match(source, /<h3 className="sectiontitle">\{workspaceReportTitles\.history\}<\/h3>/);
  assert.match(source, /<h3 className="sectiontitle">\{workspaceReportTitles\.idle\}<\/h3>/);
  assert.match(source, /<PrintButton title=\{exportTitle\} columns=\{filterColumns\} rows=\{sortedRows\} \/>/);
  assert.match(source, /<ExportMenu title=\{exportTitle\} columns=\{filterColumns\} rows=\{sortedRows\} smartPrintItem=\{!stableToolbar\} \/>/);
});

test("the manager requests table shows a single Smart Print", () => {
  // The table brings its own Smart Print when it has a print title, so the toolbar drops its duplicate.
  assert.ok(source.includes('printTitle={stableToolbar ? "Manager dashboard requests" : ""}'));
  assert.ok(source.includes("{!stableToolbar && <PrintButton title={exportTitle} columns={filterColumns} rows={sortedRows} />}"));
  // Its Export menu leaves Smart Print out too, so the button beside it is the only way in.
  assert.ok(source.includes("<ExportMenu title={exportTitle} columns={filterColumns} rows={sortedRows} smartPrintItem={!stableToolbar} />"));
});

test("an Export menu beside a Smart Print button does not repeat Smart Print", () => {
  const table = fs.readFileSync(new URL("../src/shared-actions-table.jsx", import.meta.url), "utf8");
  assert.ok(source.includes("{smartPrintItem && <button type=\"button\" role=\"menuitem\" onClick={printReport}><Printer /> Smart Print</button>}"));
  assert.ok(table.includes("smartPrintRows={smartPrintData.rows} smartPrintItem={!printData} />}"));
  assert.ok(source.includes("<ExportMenu title=\"CRM tickets report\" columns={ticketExportColumns} rows={tickets} smartPrintItem={false} />"));
});
