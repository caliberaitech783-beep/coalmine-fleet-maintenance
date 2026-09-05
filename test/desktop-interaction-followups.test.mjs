import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const sortableStyles = readFileSync(new URL("../src/sortable-table.css", import.meta.url), "utf8");

test("login mode tabs support standard desktop keyboard navigation", () => {
  const tabs = source.slice(source.indexOf("function AuthModeTabs"), source.indexOf("function Login("));
  assert.match(tabs, /event\.key === "ArrowRight"/);
  assert.match(tabs, /event\.key === "ArrowLeft"/);
  assert.match(tabs, /event\.key === "Home"/);
  assert.match(tabs, /event\.key === "End"/);
  assert.match(tabs, /tabIndex=\{mode === id \? 0 : -1\}/);
  assert.match(tabs, /onKeyDown=\{\(event\) => selectFromKeyboard\(event, index\)\}/);
});

test("report Data submenu flips left before it can leave the desktop viewport", () => {
  const actions = source.slice(source.indexOf("function ReportActionsMenu"), source.indexOf("function ActionsTable"));
  assert.match(actions, /const \[submenuSide, setSubmenuSide\] = useState\("right"\)/);
  assert.match(actions, /popoverLeft \+ 232 \+ 186 > viewport\.right - 12 \? "left" : "right"/);
  assert.match(actions, /report-actions-submenu open-\$\{submenuSide\}/);
  assert.match(sortableStyles, /\.report-actions-submenu\.open-left\{right:calc\(100% - 4px\);left:auto\}/);
  assert.match(actions, /requestAnimationFrame\(\(\) => popoverRef\.current\?\.querySelector/);
  assert.match(actions, /event\.key === "Escape"/);
  assert.match(actions, /event\.key === "ArrowDown"/);
  assert.match(actions, /event\.key === "ArrowUp"/);
  assert.match(actions, /setDataOpen\(false\)/);
});

test("Breakdown status tabs use roving focus and identify their panel", () => {
  const breakdown = source.slice(source.indexOf("Breakdown = function BreakdownWithMasterEntry"), source.indexOf("const OriginalEquipment"));
  assert.match(breakdown, /const statusTabRefs = useRef\(\[\]\)/);
  assert.match(breakdown, /event\.key === "ArrowRight"/);
  assert.match(breakdown, /event\.key === "ArrowLeft"/);
  assert.match(breakdown, /tabIndex=\{statusFilter === value \? 0 : -1\}/);
  assert.match(breakdown, /aria-controls="breakdown-status-panel"/);
  assert.match(breakdown, /statusPanelId="breakdown-status-panel"/);
  assert.match(breakdown, /statusPanelLabelledBy=\{`breakdown-status-tab-/);
});

test("a UI deployment reload preserves the signed-in browser session", () => {
  const versionCheck = source.slice(source.indexOf("const checkVersion = async"), source.indexOf("const selectMenu"));
  assert.match(versionCheck, /window\.location\.replace\(`\/\?updated=/);
  assert.doesNotMatch(versionCheck, /removeItem\("nerveCenterSession"\)/);
  assert.doesNotMatch(versionCheck, /authToken = ""/);
});
