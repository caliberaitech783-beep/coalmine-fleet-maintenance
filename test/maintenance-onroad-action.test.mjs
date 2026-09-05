import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("maintenance close action is labelled Click for onroad", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

  assert.match(source, /onClose\(row\)[\s\S]*Click for onroad/);
});

test("Maintenance places Actions before Job reference without reordering other roles", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const table = source.slice(source.indexOf("function MobileWorkflowTable("), source.indexOf("function RequestEditForm("));

  assert.match(table, /showActions && actionsFirst && <th>Actions<\/th>}\s*\{workflowHeader\("ref", "Job reference"\)/);
  assert.match(table, /\{actionsFirst && workflowActions\(row, lockedIdeal\)}\s*<td><b>\{row\.ref\}/);
  assert.match(source, /isMaintenance && tab === "requests"[^\n]*showActions actionsFirst/);
  assert.match(source, /isMaintenance && tab === "close"[^\n]*showActions actionsFirst/);
  assert.match(source, /isMis && tab === "requests"[^\n]*showActions onVerify/);
});
