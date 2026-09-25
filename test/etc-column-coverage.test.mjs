import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const browser = readFileSync(new URL("../src/dashboard-record-browser.jsx", import.meta.url), "utf8");
const fleet = readFileSync(new URL("../dashboard-equipment-metrics.mjs", import.meta.url), "utf8");
const oem = readFileSync(new URL("../src/oem-breakdown-model.mjs", import.meta.url), "utf8");
const director = readFileSync(new URL("../director-report-bundle.mjs", import.meta.url), "utf8");

test("shared production, maintenance and MIS request tables always pair breakdown time with ETC", () => {
  const breakdown = main.slice(main.indexOf("function BreakdownTable("), main.indexOf("const masterFields ="));
  const workflow = main.slice(main.indexOf("function MobileWorkflowTable("), main.indexOf("function RequestEditForm("));
  assert.match(breakdown, /\["start", "Started"\], \["expectedCompletionAt", "ETC"\]/);
  assert.match(main, /case "expectedCompletionAt": return <td>\{formatTwelveHourDateTime\(r\.expectedCompletionAt\)\}<\/td>/);
  assert.match(workflow, /const startedHeader = \(\) => <>\{workflowHeader\("start", startedLabel\)\}\{workflowHeader\("etc", "ETC"\)\}/);
  assert.match(workflow, /const startedCell = \(row\) => <><td>\{formatTwelveHourDateTime\(row\.start\)\}<\/td><td className="etc-cell">\{etcColumn\.value\(row\)\}<\/td>/);
  assert.match(workflow, /startedFirst \? \[startedColumn, etcColumn,/);
  assert.match(workflow, /: \[\.\.\.verifiedColumns, \.\.\.closedByColumns, startedColumn, etcColumn,/);
});

test("dashboard and OEM lists project and display ETC beside Started", () => {
  assert.match(browser, /<th[^>]*>Started<\/th><th>ETC<\/th>/);
  assert.match(browser, /\{formatDate\(record\.requestStart\)\}<\/td><td[^>]*>\{formatDate\(record\.requestExpectedCompletion\)\}<\/td>/);
  assert.match(main, /requestStart: request\.start \|\| "—",\r?\n\s*requestExpectedCompletion: request\.expectedCompletionAt \|\| "—"/);
  assert.match(fleet, /requestStart: current\?\.start \|\| "—",\r?\n\s*requestExpectedCompletion: current\?\.expectedCompletionAt \|\| "—"/);
  assert.match(oem, /requestStart: request\.start \|\| request\.startedAt \|\| request\.createdAt \|\| "",\r?\n\s*requestExpectedCompletion: request\.expectedCompletionAt \|\| ""/);
});

test("history, report, ageing and master lists include ETC immediately after their breakdown timestamp", () => {
  for (const pattern of [
    /label: "Breakdown opened"[^\n]+\r?\n\s*\{key: "expectedCompletionAt", label: "ETC"/,
    /label: "Breakdown time"[^\n]+\r?\n\s*\{key: "expectedCompletionAt", label: "ETC"/,
    /label: "Opened at"[^\n]+\r?\n\s*\{key: "expectedCompletionAt", label: "ETC"/,
    /label: "Latest breakdown"[^\n]+\r?\n\s*\{key: "expectedCompletionAt", label: "Latest ETC"/,
    /<th>Created<\/th><th>ETC<\/th><th>Age<\/th>/,
    /\["start", "Started"\],\r?\n\s*\["expectedCompletionAt", "ETC"\]/,
  ]) assert.match(main, pattern);
  assert.match(director, /key:'started',label:'Opened at'[^\n]+\r?\n\s*\{key:'expectedCompletionAt',label:'ETC'/);
});
