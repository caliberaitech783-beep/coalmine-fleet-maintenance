import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const shared = readFileSync(new URL("../src/shared-actions-table.jsx", import.meta.url), "utf8");
const compactCss = readFileSync(new URL("../src/maintenance-mobile-compact.css", import.meta.url), "utf8");
const tableCss = readFileSync(new URL("../src/table-actions.css", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("phone workspaces expose direct Columns, Actions, search/status and refresh controls", () => {
  assert.match(shared, /className="mobile-columns-trigger"[^>]*>[\s\S]*<span>Columns<\/span>/);
  assert.match(shared, /<Menu resetLabel="Reset table"/);
  assert.match(main, /<Menu \/> Search &amp; status/);
  assert.match(main, /className="mobile-workspace-refresh"[\s\S]*Refresh now/);
  assert.match(compactCss, /\.workflow-actions-slot \.shared-table-actions-toolbar \{ display: grid; grid-template-columns:/);
  assert.match(tableCss, /@media \(max-width: 700px\)[\s\S]*\.mobile-columns-trigger \{ display: inline-flex/);
});

test("phone tables render in small windows and offer an explicit load-more control", () => {
  assert.match(shared, /mobileTablePageSize/);
  assert.match(shared, /actual\.slice\(0, Math\.max\(0, remainingRows\)\)/);
  assert.match(shared, /className="mobile-table-window-status"/);
  assert.match(shared, /Show \{Math\.min\(pageSize, selectedRows\.length - renderedRowCount\)\} more/);
});

test("large authenticated feeds use compression and conditional private responses", () => {
  assert.match(server, /app\.use\(compression\(\{threshold:1024\}\)\)/);
  for (const endpoint of ["info-pulse", "requests", "dashboard-equipment"])
    assert.match(server, new RegExp(`sendPrivateJson\\(req,res,'${endpoint}'`));
  assert.match(server, /requestEtagMatches\(req\.get\('If-None-Match'\),etag\)/);
  assert.match(main, /"If-None-Match"/);
  assert.match(main, /response\.status === 304/);
});

test("operational dashboard polling stops while the user is in a workflow screen", () => {
  const normal = main.slice(main.indexOf("function Normal("), main.indexOf("function App("));
  assert.match(normal, /if \(section !== "dashboard"\) return undefined/);
  assert.match(normal, /\[session\?\.token,session\?\.assignedRole,embedded,isGeneral,section\]/);
});
