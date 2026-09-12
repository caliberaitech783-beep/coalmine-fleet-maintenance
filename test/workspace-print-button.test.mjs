import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("operational workspace tables expose the export print action beside the Actions button", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /function printTableReport\(\{ title, columns = \[\], rows = \[\], highlightRow \}\) \{/);
  assert.match(source, /function PrintButton\(\{ title, columns = \[\], rows = \[\], className = "secondary", highlightRow \}\) \{/);
  assert.match(source, /className=\{`\$\{className\} print-table-trigger`\} onClick=\{\(\) => printTableReport\(\{ title, columns, rows, highlightRow \}\)\}><Printer \/><span>Print<\/span><\/button>/);
  const handlerStart = source.indexOf('  const printReport = () => {');
  const handlerEnd = source.indexOf('  if (printOnly)', handlerStart);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  const calls = [], columns = [{label: 'Reference'}], rows = [{ref: 'PRINT-TEST'}];
  const printReport = new Function('dashboardPdf', 'printTableReport', 'setOpen', 'title', 'columns', 'rows', 'highlightRow',
    `${source.slice(handlerStart, handlerEnd)}; return printReport;`)(false, args => calls.push(args), value => calls.push(value), 'Workspace', columns, rows, undefined);
  printReport();
  assert.deepEqual(calls, [{title: 'Workspace', columns, rows, highlightRow: undefined}, false]);
  assert.match(source, /ref=\{setActionsToolbarTarget\} \/>\}<PrintButton title=\{exportTitle\} columns=\{filterColumns\} rows=\{sortedRows\} \/><TableParameterFilter/);
  assert.match(source, /<div className="workflow-actions-slot" ref=\{setActionsToolbarTarget\} \/><PrintButton title=\{exportTitle\} columns=\{filterColumns\} rows=\{sortedRows\} highlightRow=\{lateAcceptanceHighlight\} \/><TableParameterFilter/);
});
