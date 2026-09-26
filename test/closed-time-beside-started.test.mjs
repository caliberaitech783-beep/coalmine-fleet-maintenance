import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import React from "react";
import { tableModel, requestColumnsInWorkflowOrder, closedTimeAfterStartedColumns } from "../src/table-actions-model.mjs";

const h = React.createElement;
const Header = () => null;
const header = (cells) => tableModel(h("thead", {}, h("tr", {}, cells.map(([sortKey, label]) => sortKey ? h(Header, { key: sortKey, sortKey, label }) : h("th", { key: label }, label))))).columns;
const labels = (columns) => columns.map((column) => column.label);
const main = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const shared = fs.readFileSync(new URL("../src/shared-actions-table.jsx", import.meta.url), "utf8");

test("the closing time column moves after Started and its ETC whatever the columns are called", () => {
  const plain = header([[null, "Job reference"], [null, "Started"], [null, "Days of breakdown"], [null, "Closing time"], [null, "Door no."]]);
  assert.deepEqual(labels(closedTimeAfterStartedColumns(plain)), ["Job reference", "Started", "Closing time", "Days of breakdown", "Door no."]);
  const mis = header([["door", "Door no."], ["start", "Production date and time"], ["closedBy", "Closed by"], ["verifiedAt", "Verified date & time"], ["closedAt", "Maintenance Closing Time"]]);
  assert.deepEqual(labels(closedTimeAfterStartedColumns(mis)), ["Door no.", "Production date and time", "Maintenance Closing Time", "Closed by", "Verified date & time"]);
  const requests = header([["ref", "Job reference"], ["closedAt", "Closed time"], ["start", "Started"], ["hours", "Turn around time (TAT)"]]);
  assert.deepEqual(labels(closedTimeAfterStartedColumns(requests)), ["Job reference", "Started", "Closed time", "Turn around time (TAT)"]);
  const withEtc = header([["closedAt", "Closed time"], ["start", "Started"], ["etc", "ETC"], ["status", "Status"]]);
  assert.deepEqual(labels(closedTimeAfterStartedColumns(withEtc)), ["Started", "ETC", "Closed time", "Status"]);
  // Column indices still point at the original cells, so values, filters and exports stay aligned.
  assert.deepEqual(closedTimeAfterStartedColumns(header([["start", "Started"], ["site", "Site"], ["closedAt", "Closing time"]])).map((column) => column.index), [0, 2, 1]);
});

test("the idle vehicle date keeps its place beside Started and tables without both columns are untouched", () => {
  const idle = header([["start", "Started"], ["idleDate", "Idle Vehicle Date"], ["closedBy", "Closed by"], ["closedAt", "Closing time"]]);
  assert.deepEqual(labels(closedTimeAfterStartedColumns(idle)), ["Started", "Idle Vehicle Date", "Closing time", "Closed by"]);
  const noStart = header([["door", "Door no."], ["closedAt", "Closing time"], ["status", "Status"]]);
  assert.deepEqual(labels(closedTimeAfterStartedColumns(noStart)), ["Door no.", "Closing time", "Status"]);
  const noClose = header([["start", "Started"], ["status", "Status"], ["closedBy", "Closed by"]]);
  assert.deepEqual(labels(closedTimeAfterStartedColumns(noClose)), ["Started", "Status", "Closed by"]);
});

test("maintenance closed history tables show the closing time right after Started in the shared layout", () => {
  // Maintenance User workspace: the workflow table leads with Door no. and Status, then Started and its closing time.
  const workflow = header([["ref", "Job reference"], ["equipmentGroup", "Equipment group"], ["door", "Door no."], ["site", "Site location"], ["category", "Breakdown type"],
    ["delayedReason", "Delayed reason"], ["status", "Status"], ["idleReason", "Idle reason"], ["complaint", "Breakdown reason"], ["closedBy", "Closed by"], ["start", "Started"], ["etc", "ETC"],
    ["closedAt", "Closing time"], ["breakdownDays", "Days of breakdown"], ["dailyRemarks", "Daily remarks"], ["maintenanceWork", "Work completion action taken"]]);
  const workspace = closedTimeAfterStartedColumns(requestColumnsInWorkflowOrder(workflow, true));
  assert.deepEqual(labels(workspace).slice(0, 8), ["Job reference", "Door no.", "Status", "Started", "ETC", "Closing time", "Days of breakdown", "Breakdown reason"]);
  // Manager dashboard and Production closed history: the breakdown table opens with the two timestamps.
  const breakdown = header([["ref", "Job reference"], ["equipment", "Equipment group"], ["door", "Door no."], ["make", "Make"], ["model", "Model"], ["site", "Site location"],
    ["complaint", "Breakdown reason"], ["closedBy", "Closed by"], ["maintenanceWork", "Work completion action taken"], ["closingHmr", "Closing HMR"], ["closingKmr", "Closing KMR"],
    ["breakdownDays", "Days of breakdown"], ["category", "Breakdown type"], ["delayedReason", "Delayed reason"], ["start", "Started"], ["etc", "ETC"], ["closedAt", "Closing time"], ["hours", "Downtime"],
    ["status", "Status"], ["idleReason", "Idle reason"], ["dailyRemarks", "Daily remarks"], ["owner", "Responsibility"]]);
  const manager = closedTimeAfterStartedColumns(requestColumnsInWorkflowOrder(breakdown, false));
  assert.deepEqual(labels(manager).slice(0, 5), ["Job reference", "Started", "ETC", "Closing time", "Days of breakdown"]);
});

test("every maintenance closed history view asks for the closing time beside Started", () => {
  assert.match(shared, /if \(closedTimeAfterStarted\) closedTimeAfterStartedColumns\(columns\);/);
  assert.match(main, /import \{ closedTimeAfterStartedColumns, ensureJobReferenceVisibleKeys \} from "\.\/table-actions-model\.mjs";/);
  // Workspace "Closed history" tab (Maintenance, MIS and General users share the workflow table).
  assert.match(main, /tab === "history"[^\n]*<MobileWorkflowTable rows=\{historyRows\}[^\n]*showClosedAt=\{isMaintenance \|\| isMis\} closedAtLabel=\{closedHistoryClosingLabel\}[^\n]*closedTimeAfterStarted \{\.\.\.adminDeleteProps\} \/>/);
  // Production users see the breakdown table version of the same history.
  assert.match(main, /tab === "history"[^\n]*<BreakdownTable rows=\{historyRows\}[^\n]*showClosedBy showBreakdownDays showClosedAt \/>/);
  // Manager dashboard: the Closed history queue tab, the Completed card and the MIS Manager closed history drilldown.
  assert.match(main, /<BreakdownTable rows=\{visibleDetailRows\}[^>]*showClosedBy=\{queueTab==="history"\} showClosedAt=\{queueTab==="history"\}/);
  assert.match(main, /<BreakdownTable rows=\{managerRequestDrilldownRows\}[^\n]*showClosedAt=\{managerDrilldownAction\.key==="maintenance-completed"\}/);
  assert.match(main, /<MobileWorkflowTable rows=\{managerRequestDrilldownRows\}[^\n]*closedAtLabel="Maintenance Closing Time"[^\n]*startedFirst closedTimeAfterStarted \/>/);
});

test("the breakdown table renders, exports and sorts ETC and closing time after Started", () => {
  const breakdown = main.slice(main.indexOf("function BreakdownTable("), main.indexOf("const masterFields ="));
  assert.match(breakdown, /showClosedBy = false, showClosedAt = false, closedAtLabel = "Closing time",/);
  assert.match(breakdown, /\["start", "Started"\], \["expectedCompletionAt", "ETC"\], \.\.\.\(showClosedAt \? \[\["closedAt", closedAtLabel\], \.\.\.\(showCompletionDetails \? \[\] : \[\["closingHmr", "Closing HMR"\], \["closingKmr", "Closing KMR"\]\]\)\] : \[\]\), \["hours",/);
  // Opening meter readings always follow the breakdown reason; closing readings sit right after the closing time.
  assert.match(breakdown, /\.\.\.\(showReason \? \[\["complaint", "Breakdown reason"\]\] : \[\]\), \["openingHmr", "Opening HMR"\], \["openingKmr", "Opening KMR"\],/);
  assert.match(breakdown, /\{showClosedAt && <td>\{formatTwelveHourDateTime\(r\.closedAt\)\}<\/td>\}\r?\n\s*\{showClosedAt && !showCompletionDetails && <><td>\{breakdownMeterValue\(r, "HMR", "closing"\)\}<\/td><td>\{breakdownMeterValue\(r, "KMR", "closing"\)\}<\/td><\/>\}/);
  assert.match(breakdown, /if \(key === "closedAt"\) return formatTwelveHourDateTime\(row\.closedAt\);/);
  assert.match(main, /case "start": return <td>\{formatTwelveHourDateTime\(r\.start\)\}<\/td>;\r?\n\s*case "expectedCompletionAt": return <td>\{formatTwelveHourDateTime\(r\.expectedCompletionAt\)\}<\/td>;\r?\n\s*case "closedAt":/);
  assert.match(breakdown, /<ActionsTable className="breakdown-table-auto-fit" closedTimeAfterStarted=\{showClosedAt\}/);
  assert.match(main, /case "closedAt": return <td>\{formatTwelveHourDateTime\(r\.closedAt\)\}<\/td>;/);
  const workflow = main.slice(main.indexOf("function MobileWorkflowTable("), main.indexOf("function RequestEditForm("));
  assert.match(workflow, /\];\r?\n\s*\/\/ Exports and prints follow the on-screen layout[^\n]*\r?\n\s*if \(closedTimeAfterStarted\) closedTimeAfterStartedColumns\(filterColumns\);/);
});
