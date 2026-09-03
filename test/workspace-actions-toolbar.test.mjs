import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const sharedTable = readFileSync(new URL("../src/shared-actions-table.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/table-actions.css", import.meta.url), "utf8");

test("every operational workspace places Actions beside the status selector", () => {
  const start = main.indexOf("function MobileWorkflowTable(");
  const end = main.indexOf("function RequestEditForm(", start);
  const workflowTable = main.slice(start, end);

  assert.match(workflowTable, /<option value="">All statuses<\/option>[\s\S]*className="workflow-actions-slot"/);
  assert.match(workflowTable, /<ActionsTable className="workflow-table" toolbarTarget=\{actionsToolbarTarget\}>/);
  assert.match(sharedTable, /toolbarTarget \? createPortal\(actionsToolbar, toolbarTarget\) : actionsToolbar/);
  assert.match(styles, /\.workflow-actions-slot \.shared-table-actions-toolbar,[\s\S]*\.master-actions-slot \.shared-table-actions-toolbar \{ position: static; width: auto;/);
});
