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
  assert.doesNotMatch(source, /<PrintButton/);
  assert.match(source, /<ExportMenu title=\{exportTitle\} columns=\{filterColumns\} rows=\{sortedRows\} smartPrintItem \/>/);
});

test("the manager requests table has one Smart Export with Smart Print inside", () => {
  assert.ok(source.includes('printTitle={stableToolbar ? "Manager dashboard requests" : ""}'));
  assert.ok(source.includes('exportTitle={stableToolbar ? exportTitle : ""}'));
  assert.ok(source.includes("{!stableToolbar && <ExportMenu title={exportTitle} columns={filterColumns} rows={sortedRows} smartPrintItem />}"));
});

test("Smart Print is included in table and ticket export menus", () => {
  const table = fs.readFileSync(new URL("../src/shared-actions-table.jsx", import.meta.url), "utf8");
  assert.ok(source.includes("{smartPrintItem && <button type=\"button\" role=\"menuitem\" onClick={printReport}><Printer /> Smart Print</button>}"));
  assert.ok(table.includes("smartPrintRows={smartPrintData.rows} smartPrintItem />}"));
  assert.doesNotMatch(table, /<ExportMenu printOnly/);
  assert.ok(source.includes("<ExportMenu title=\"CRM tickets report\" columns={ticketExportColumns} rows={tickets} smartPrintItem />"));
});
