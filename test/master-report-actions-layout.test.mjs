import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const tableStyles = readFileSync(new URL("../src/table-actions.css", import.meta.url), "utf8");
const reportStyles = readFileSync(new URL("../src/reports-workspace.css", import.meta.url), "utf8");

test("all tabular masters place Actions beside Search", () => {
  const equipment = source.slice(source.indexOf("function Equipment("), source.indexOf("function Breakdown(", source.indexOf("function Equipment(")));
  const generic = source.slice(source.indexOf("function MasterPage("), source.indexOf("function MasterLoader("));
  const hierarchy = source.slice(source.indexOf("function HierarchyMasterPage("), source.indexOf("function RegionMasterPage("));

  assert.match(equipment, /placeholder="Search equipment, category, serial no\.\.\.\."[\s\S]*className="master-actions-slot"/);
  assert.match(equipment, /<ActionsTable toolbarTarget=\{actionsToolbarTarget\}>/);
  assert.match(generic, /placeholder=\{"Search " \+ name\.toLowerCase\(\)\}[\s\S]*className="master-actions-slot"/);
  assert.match(generic, /<ActionsTable toolbarTarget=\{actionsToolbarTarget\}>/);
  assert.match(hierarchy, /className="master-search-actions"[\s\S]*className="master-actions-slot"/);
  assert.match(hierarchy, /<ActionsTable className="hierarchy-matrix" toolbarTarget=\{actionsToolbarTarget\}>/);
  assert.match(source, /<BreakdownTable rows=\{rows\} stickyHeader showAudio showMakeModel actionsBesideSearch \/>/);
  assert.match(tableStyles, /\.master-actions-slot \.shared-table-actions-toolbar \{ position: static; width: auto;/);
});

test("report Rows and Actions controls render to the left of Generate", () => {
  const reportSection = source.slice(source.indexOf("function ReportSection("), source.indexOf("function ReportsPage("));
  const reportTable = source.slice(source.indexOf("function ReportTable("), source.indexOf("function MasterField("));

  assert.match(reportSection, /className="report-heading-table-actions"[\s\S]*label="Generate"/);
  assert.match(reportSection, /toolbarTarget=\{tableToolbarTarget\}/);
  assert.match(reportTable, /className="report-row-limit"[\s\S]*<ReportActionsMenu/);
  assert.match(reportTable, /toolbarTarget \? createPortal\(reportTableToolbar, toolbarTarget\) : reportTableToolbar/);
  assert.match(reportStyles, /\.generated-report-heading-actions \{[\s\S]*display: flex;[\s\S]*justify-content: flex-end;/);
});
