import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/mobile-workflow.css", import.meta.url), "utf8");

test("all operational users receive expandable request cards on phones", () => {
  const breakdown = source.slice(source.indexOf("function BreakdownTable("), source.indexOf("const masterFields"));
  const workflow = source.slice(source.indexOf("function MobileWorkflowTable("), source.indexOf("function RequestEditForm("));

  assert.match(breakdown, /className="mobile-request-cards"[\s\S]*<details className="mobile-request-card"/);
  assert.match(workflow, /className="mobile-request-cards"[\s\S]*<details className="mobile-request-card"/);
  assert.match(workflow, /mobile-request-card-actions[^\n]*workflowActionButtons\(row, lockedIdeal\)/);
  assert.match(styles, /@media \(max-width: 600px\)[\s\S]*\.mobile-workspace \.mobile-request-cards \{[\s\S]*display: grid/);
  assert.match(styles, /\.mobile-workspace \.mobile-request-cards \+ table \{ display: none !important; \}/);
});

test("desktop request tables remain visible and unchanged", () => {
  assert.match(styles, /\.mobile-request-cards \{ display: none; \}/);
  assert.doesNotMatch(styles, /@media \(min-width:[^)]+\)[\s\S]*mobile-request-cards \+ table/);
});
