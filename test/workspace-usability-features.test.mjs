import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("operational tables expose search, filters, sorting, and the MIS idle queue", () => {
  assert.match(ui, /table-search-toolbar/);
  assert.match(ui, /ListFilter/);
  assert.match(ui, /SortableHeader label="Job reference"/);
  assert.match(ui, />Idle Vehicles</);
  assert.match(ui, /tab === "idle"/);
  assert.match(ui, /showRequestsMenu&&canSeeRequestMenu\("Closed history"\)&&<button className=\{tab === "idle"/);
  assert.doesNotMatch(ui, /isMis && tab === "idle"/);
});

test("request forms expose elapsed time, site-scoped all-equipment search, and ETC", () => {
  assert.match(ui, /request-form-timer/);
  assert.match(ui, /setElapsedSeconds/);
  assert.match(ui, /searchableRecords = equipmentSearchActive \|\| equipmentSearch\.trim\(\) \? locationEquipmentRecords : groupRecords/);
  assert.match(ui, /ETC \(Expected Time For Completion\)/);
  assert.match(server, /expected_completion_at TIMESTAMPTZ/);
  assert.match(server, /expectedCompletionAt/);
});

test("workspaces, masters, tables, and forms use the expanded readable layout", () => {
  assert.match(css, /\.normal>main\{width:100%;max-width:none/);
  assert.match(css, /\.body\{max-width:none;width:100%/);
  assert.match(css, /\.modal\{width:min\(960px/);
  assert.match(css, /table\{font-size:13px\}/);
});
