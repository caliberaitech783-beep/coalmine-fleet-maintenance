import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("operational workspace tables expose the export print action beside the Actions button", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /function printTableReport\(\{ title, columns = \[\], rows = \[\] \}\) \{/);
  assert.match(source, /function PrintButton\(\{ title, columns = \[\], rows = \[\], className = "secondary" \}\) \{/);
  assert.match(source, /className=\{`\$\{className\} print-table-trigger`\} onClick=\{\(\) => printTableReport\(\{ title, columns, rows \}\)\}><Printer \/><span>Print<\/span><\/button>/);
  assert.match(source, /const printReport = \(\) => \{ printTableReport\(\{ title, columns, rows \}\); setOpen\(false\); \};/);
  assert.match(source, /ref=\{setActionsToolbarTarget\} \/>\}<PrintButton title="Breakdown report" columns=\{filterColumns\} rows=\{sortedRows\} \/><TableParameterFilter/);
  assert.match(source, /<div className="workflow-actions-slot" ref=\{setActionsToolbarTarget\} \/><PrintButton title="Workflow report" columns=\{filterColumns\} rows=\{sortedRows\} \/><TableParameterFilter/);
});
