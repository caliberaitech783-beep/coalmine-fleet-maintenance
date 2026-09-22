import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const shared = readFileSync(new URL("../src/shared-actions-table.jsx", import.meta.url), "utf8");
const compactCss = readFileSync(new URL("../src/maintenance-mobile-compact.css", import.meta.url), "utf8");
const tableCss = readFileSync(new URL("../src/table-actions.css", import.meta.url), "utf8");
const phoneCss = readFileSync(new URL("../src/mobile-phone-optimization.css", import.meta.url), "utf8");
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
  assert.match(server, /app\.use\(compression\(\{/);
  assert.match(server, /threshold:1024/);
  assert.match(server, /if\(req\.path\.startsWith\('\/assets\/'\)\)return false/);
  assert.match(server, /return compression\.filter\(req,res\)/);
  for (const endpoint of ["info-pulse", "requests", "dashboard-equipment"])
    assert.match(server, new RegExp(`sendPrivateJson\\(req,res,'${endpoint}'`));
  assert.match(server, /requestEtagMatches\(req\.get\('If-None-Match'\),etag\)/);
  assert.match(main, /"If-None-Match"/);
  assert.match(main, /response\.status === 304/);
});

test("only production dashboard and reports use the dedicated site-wide poller", () => {
  const normal = main.slice(main.indexOf("function Normal("), main.indexOf("function App("));
  assert.match(normal, /if \(!needsDedicatedDashboardFeed\) return undefined/);
  assert.match(normal, /if \(!\['dashboard','reports'\]\.includes\(section\)\) return undefined/);
  assert.match(normal, /\[session\?\.token,needsDedicatedDashboardFeed,section\]/);
});

test("the final phone layer keeps core actions visible while collapsing secondary chrome", () => {
  assert.ok(main.indexOf('import "./mobile-phone-optimization.css"') > main.indexOf('import "./dashboard-spacing.css"'));
  assert.match(phoneCss, /\.table-search-toolbar\[data-mobile-open="false"\][\s\S]*\.workflow-actions-slot \.shared-table-actions-toolbar > :is\(\.record-date-range, \.export-menu, \.secondary\)/);
  assert.match(phoneCss, /grid-template-columns:\s*minmax\(0, 1\.25fr\) repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(phoneCss, /:is\(\.mobile-columns-trigger, \.report-actions-trigger\)/);
  assert.doesNotMatch(phoneCss, /\.mobile-columns-trigger[^{}]*\{[^}]*display:\s*none/);
  assert.doesNotMatch(phoneCss, /\.report-actions-trigger[^{}]*\{[^}]*display:\s*none/);
});

test("phone report and ticket layouts retain every workflow in compact horizontal controls", () => {
  assert.match(phoneCss, /\.reports-page \.reports-category-tabs\s*\{[^}]*display:\s*flex !important[^}]*overflow-x:\s*auto/);
  assert.match(phoneCss, /\.reports-page \.report-name-tabs\s*\{[^}]*flex-wrap:\s*nowrap !important[^}]*overflow-x:\s*auto/);
  assert.match(phoneCss, /\.reports-page \.generated-report-title\s*\{[^}]*flex:\s*0 0 auto !important/);
  assert.match(phoneCss, /\.ticket-page \.ticket-page-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(phoneCss, /\.ticket-page \.master-actions-slot \.record-date-range\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(main, /useState\(\(\) => mobileTablePageSize\(\) \|\| 50\)/);
});

test("phone alerts are bounded and unchanged feeds avoid expensive workflow rerenders", () => {
  assert.match(phoneCss, /\.incoming-notification \.notification-details\s*\{[^}]*-webkit-line-clamp:\s*3/);
  assert.match(phoneCss, /\.incoming-notification-close\s*\{[^}]*min-width:\s*40px[^}]*min-height:\s*40px/);
  assert.match(main, /setInterval\(checkVersion, adaptiveRefreshInterval\(window, 5 \* 60_000\)\)/);
  assert.match(main, /if \(responsiveMobile && selectedOperationalRole && current\.token === session\.token && current\.loaded && !current\.error\) return current/);
});
