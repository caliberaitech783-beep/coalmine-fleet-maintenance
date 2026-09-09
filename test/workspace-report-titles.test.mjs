import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("workspace report names are visible and used by print, PDF, and Excel exports", () => {
  assert.match(source, /requests: isProduction \? "Active Production Requests" : isMaintenance \? "Active Maintenance Requests" : "MIS Requests Awaiting Verification"/);
  assert.match(source, /history: isProduction \? "Closed Production Requests" : isMaintenance \? "Closed Maintenance Requests" : "Closed MIS Requests"/);
  assert.match(source, /idle: "Idle Vehicles"/);
  assert.match(source, /<h3 className="sectiontitle">\{workspaceReportTitles\.requests\}<\/h3>/);
  assert.match(source, /<h3 className="sectiontitle">\{workspaceReportTitles\.history\}<\/h3>/);
  assert.match(source, /<h3 className="sectiontitle">\{workspaceReportTitles\.idle\}<\/h3>/);
  assert.match(source, /<PrintButton title=\{exportTitle\} columns=\{filterColumns\} rows=\{sortedRows\} \/>/);
  assert.match(source, /<ExportMenu title=\{exportTitle\} columns=\{filterColumns\} rows=\{sortedRows\} \/>/);
});
