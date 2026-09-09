import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
const mobileCss = readFileSync(new URL("../src/mobile-compat.css", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("operational tables expose search, filters, sorting, and the MIS idle queue", () => {
  assert.match(ui, /table-search-toolbar/);
  assert.match(ui, /ListFilter/);
  assert.match(ui, /workflowHeader\("ref", "Job reference"\)/);
  assert.match(ui, /const workflowHeader = \(key, label\) => <FilterableHeader/);
  assert.match(ui, />Idle Vehicles</);
  assert.match(ui, /tab === "idle"/);
  assert.match(ui, /showRequestsMenu&&canSeeRequestMenu\("Closed history"\)&&<button className=\{tab === "idle"/);
  assert.doesNotMatch(ui, /isMis && tab === "idle"/);
});

test("request forms expose elapsed time, site/group-scoped equipment search, and ETC", () => {
  assert.match(ui, /request-form-timer/);
  assert.match(ui, /setElapsedSeconds/);
  assert.match(ui, /groupRecords = requestEquipmentRecordsForGroup\(locationEquipmentRecords, equipmentGroup\)/);
  assert.match(ui, /<EquipmentCombobox[^]*records=\{groupRecords\}/);
  assert.doesNotMatch(ui, /equipmentSearchActive/);
  assert.match(readFileSync(new URL('../src/maintenance-etc-input.jsx', import.meta.url), 'utf8'), /ETC \(Expected Time For Completion\)/);
  assert.match(server, /expected_completion_at TIMESTAMPTZ/);
  assert.match(server, /expectedCompletionAt/);
});

test("Maintenance User edits ETC instead of entering it in the close form", () => {
  const editForm = ui.slice(ui.indexOf("function RequestEditForm"), ui.indexOf("function CloseRequestForm"));
  const closeForm = ui.slice(ui.indexOf("function CloseRequestForm"), ui.indexOf("function VerifyRequestForm"));
  assert.match(editForm, /<MaintenanceEtcInput value=\{expectedCompletionAt\} onChange=\{setExpectedCompletionAt\}/);
  assert.match(editForm, /expectedCompletionAt: form\.get\("expectedCompletionAt"\)/);
  assert.doesNotMatch(closeForm, /name="expectedCompletionAt"/);
  assert.match(server, /requestExpectedCompletionValue\(before\.expectedCompletionAt,expectedCompletionAt\)/);
  assert.match(server, /expected_completion_at=\$3::timestamptz/);
  assert.match(server, /requireCorrectionReason:\['expectedCompletionAt'\]/);
});

test("workspaces, masters, tables, and forms use the expanded readable layout", () => {
  assert.match(css, /\.normal>main\{width:100%;max-width:none/);
  assert.match(css, /\.body\{max-width:none;width:100%/);
  assert.match(css, /\.modal\{width:min\(960px/);
  assert.match(css, /table\{font-size:13px\}/);
});

test("mobile dialogs and popovers follow touch input and the visible iOS viewport", () => {
  assert.doesNotMatch(ui, /onMouseDown|addEventListener\("mousedown"|removeEventListener\("mousedown"/);
  assert.match(ui, /window\.visualViewport\?\.addEventListener\("resize"/);
  assert.match(ui, /onPointerDown=\{onClose\}/);
  assert.match(mobileCss, /\.report-columns-dialog,[\s\S]*max-height: calc\(100dvh - 48px\)/);
  assert.match(mobileCss, /\.report-column-list \{[\s\S]*height: min\(340px, 45dvh\)/);
  assert.match(mobileCss, /touch-action: manipulation/);
});
