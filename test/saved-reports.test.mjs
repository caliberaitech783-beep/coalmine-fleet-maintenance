import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import {
  defaultSavedReportName,
  normalizeSavedReportName,
  sanitizeTableView,
  savedReportKey,
  savedReportUserKey,
  savedReportValidationError,
  serializeTableView,
} from "../src/saved-reports.mjs";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const shared = readFileSync(new URL("../src/shared-actions-table.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const routeOf = (start) => server.slice(server.indexOf(start), server.indexOf("\napp.", server.indexOf(start) + start.length));

test("report names are trimmed, required and capped; the table key mixes the title and the column set", () => {
  assert.equal(normalizeSavedReportName("  Sasti   OB open  "), "Sasti OB open");
  assert.equal(savedReportValidationError({ name: " ", key: "k" }), "Give the report a name before saving.");
  assert.equal(savedReportValidationError({ name: "x".repeat(81), key: "k" }), "Keep the report name within 80 characters.");
  assert.equal(savedReportValidationError({ name: "Open BD", key: "" }), "This table cannot be saved.");
  assert.equal(savedReportValidationError({ name: "Open BD", key: "k", state: { filters: { a: "x".repeat(20001) } } }), "This report view is too large to save.");
  assert.equal(savedReportValidationError({ name: "Open BD", key: "k", state: {} }), "");
  const columns = [{ key: "status" }, { key: "door" }];
  assert.equal(savedReportKey("OEM BD · SCANIA", columns), "oem bd · scania|status,door");
  assert.notEqual(savedReportKey("OEM BD · SCANIA", columns), savedReportKey("OEM BD · SCANIA", [{ key: "status" }]));
  assert.equal(savedReportKey("", []), "table|");
  assert.equal(defaultSavedReportName("Closed production requests", new Date(2026, 8, 15)), "Closed production requests 15-09-2026");
});

test("a saved view keeps only what the table can restore and drops columns that no longer exist", () => {
  const view = serializeTableView({ visible: ["status", "door"], filters: { status: "Open", door: "  ", site: "Sasti" }, sort: { key: "door", direction: "desc" }, dateRange: "2026-09-01..2026-09-15", pageSize: 100 });
  assert.deepEqual(view, { visible: ["status", "door"], filters: { status: "Open", site: "Sasti" }, sort: { key: "door", direction: "desc" }, dateRange: "2026-09-01..2026-09-15", pageSize: 100 });
  const applied = sanitizeTableView(view, [{ key: "status" }, { key: "days" }]);
  assert.deepEqual(applied, { visible: ["status"], filters: { status: "Open" }, sort: { key: "", direction: "asc" }, dateRange: "2026-09-01..2026-09-15", pageSize: 100 });
  assert.deepEqual(sanitizeTableView(null, []).visible, []);
  assert.equal(savedReportUserKey({ login: " Ramesh " }), "ramesh");
  assert.equal(savedReportUserKey({ name: "Ramesh Kumar" }), "name:ramesh kumar");
});

test("the dialogs name the report, warn before replacing, offer printing after saving and list saved views", () => {
  const source = readFileSync(new URL("../src/saved-reports.jsx", import.meta.url), "utf8");
  assert.match(source, /export function SaveReportDialog\(\{ title = "", defaultName = "", existingNames = \[\], onSave, onClose \}\)/);
  assert.match(source, /A report with this name exists and will be replaced\./);
  assert.match(source, /export function PrintReportPrompt\(\{ name = "", canPrint = true, onPrint, onClose \}\)/);
  assert.match(source, /Print this report now\?/);
  assert.match(source, /Print now<\/button>/);
  assert.match(source, /export function SavedReportsDialog\(/);
  assert.match(source, /No saved reports yet\. Use Actions, Report, Save report to keep the current view\./);
  assert.match(source, /export function SavedReportsPanel\(\{ title = "", tableKey = "", columns = \[\], open = "", onOpenChange, currentView, onApply, canPrint = false, onPrint \}\)/);
  assert.match(source, /const result = await store\.save\(name, serializeTableView\(currentView\(\)\)\); close\(\); setSaved\(\{ name: result\?\.name \|\| name \}\);/, "saving opens the print prompt");
  assert.match(source, /onPrint=\{\(report\) => \{ apply\(report\); close\(\); window\.setTimeout\(onPrint, 60\); \}\}/, "a saved report can be reopened and printed");
  assert.match(source, /Authorization: `Bearer \$\{storedSessionToken\(\)\}`/, "requests carry the signed-in session");
  assert.ok(React.isValidElement(React.createElement("div")));
});

test("every Actions table offers Report, Save report and Saved reports and prints through Smart Print", () => {
  assert.match(main, /onSaveReport, onSavedReports \}\) \{/, "the Actions menu accepts the report actions");
  assert.match(main, /<span>Report<\/span><ChevronRight \/><\/button>/);
  assert.match(main, /<span>Save report…<\/span>/);
  assert.match(main, /<FolderOpen \/><span>Saved reports<\/span>/);
  assert.match(main, /const printSavedReport = \(\{ title, columns, rows \}\) => openSmartPrint\(\{ title, columns, rows, onPrint: printTableReport, formatCell: exportCellText \}\);/);
  assert.match(main, /<SharedActionsTable \{\.\.\.props\} printReport=\{printSavedReport\} SavedReports=\{SavedReportsPanel\}/);
  assert.match(shared, /printReport = null, SavedReports = null, showRowNumbers = true, \.\.\.tableProps \}\) \{/);
  assert.match(shared, /onSaveReport=\{SavedReports \? \(\) => setSavedReportDialog\("save"\) : undefined\} onSavedReports=\{SavedReports \? \(\) => setSavedReportDialog\("saved"\) : undefined\}/);
  assert.match(shared, /<SavedReports title=\{reportTitle\} tableKey=\{tableProps\.className \|\| ""\} columns=\{columns\} open=\{savedReportDialog\} onOpenChange=\{setSavedReportDialog\} currentView=\{currentView\} onApply=\{applySavedView\} canPrint=\{canPrintReport\} onPrint=\{printCurrentView\} \/>/);
  assert.doesNotMatch(shared, /savedReportKey|serializeTableView|sanitizeTableView/, "the shared table stays free of saved-report helpers so source-evaluating tests keep working");
  // The Reports page table gets the same flow on its own state.
  const reportTable = main.slice(main.indexOf("function ReportTable("), main.indexOf("function ReportTable(") + 9000);
  assert.match(reportTable, /const currentSavedView = \(\) => \(\{ visible: displayedColumns\.map\(\(column\) => column\.key\), filters: columnFilters, sort, pageSize \}\);/);
  assert.match(reportTable, /openSmartPrint\(\{ title: reportTitle, columns: displayedColumns, rows: sortedRows, onPrint: printTableReport, formatCell: exportCellText \}\)/);
  assert.match(reportTable, /<SavedReportsPanel title=\{reportTitle\} columns=\{columns\} open=\{savedReportDialog\}/);
});

test("saved reports are stored per user on the server and replaced by name", () => {
  assert.match(server, /CREATE TABLE IF NOT EXISTS saved_table_reports \(/);
  assert.match(server, /UNIQUE \(user_key, report_key, name\)/);
  assert.match(server, /app\.get\('\/api\/saved-reports',requireSession,/);
  assert.match(server, /app\.post\('\/api\/saved-reports',requireSession,/);
  assert.match(server, /app\.delete\('\/api\/saved-reports\/:reportId',requireSession,/);
  const save = routeOf("app.post('/api/saved-reports',");
  assert.match(save, /savedReportValidationError\(\{name,key,state\}\)/);
  assert.match(save, /ON CONFLICT \(user_key,report_key,name\) DO UPDATE SET state=EXCLUDED\.state,updated_at=NOW\(\)/);
  assert.match(save, /savedReportUserKey\(req\.session\)/);
  const remove = routeOf("app.delete('/api/saved-reports/:reportId',");
  assert.match(remove, /DELETE FROM saved_table_reports WHERE id=\$1 AND user_key=\$2/, "a user can delete only their own saved reports");
  const list = routeOf("app.get('/api/saved-reports',");
  assert.match(list, /WHERE user_key=\$1 AND report_key=\$2 ORDER BY lower\(name\) ASC/);
});
