import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { REQUEST_ACCEPTANCE_DELAY_MS, requestAcceptedLate, requestAwaitingAcceptance } from "../request-acceptance.mjs";

test("unaccepted requests are highlighted one hour after production timing", () => {
  const start = "2026-09-07 10:00";
  const productionEpoch = Date.parse("2026-09-07T10:00:00+05:30");
  assert.equal(requestAwaitingAcceptance({ start, status: "Open", acceptanceRequired: true }, productionEpoch + REQUEST_ACCEPTANCE_DELAY_MS - 1), false);
  assert.equal(requestAwaitingAcceptance({ start, status: "Open", acceptanceRequired: true }, productionEpoch + REQUEST_ACCEPTANCE_DELAY_MS), true);
  assert.equal(requestAwaitingAcceptance({ start, status: "Open", acceptanceRequired: true, acceptedAt: "2026-09-07 11:00" }, productionEpoch + REQUEST_ACCEPTANCE_DELAY_MS * 2), false);
  assert.equal(requestAwaitingAcceptance({ start, status: "Closed", acceptanceRequired: true }, productionEpoch + REQUEST_ACCEPTANCE_DELAY_MS * 2), false);
  assert.equal(requestAwaitingAcceptance({ start, status: "Open" }, productionEpoch + REQUEST_ACCEPTANCE_DELAY_MS * 2), false);
});

test("Maintenance acceptance is server timed and shared by every request view", () => {
  const client = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const workflowCss = readFileSync(new URL("../src/mobile-workflow.css", import.meta.url), "utf8");
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const editForm = client.slice(client.indexOf("function RequestEditForm"), client.indexOf("function CloseRequestForm"));
  assert.match(client, /request\.acceptanceRequired \? "Production timing" : "Timing"/);
  assert.match(client, /request\.acceptanceRequired && <label>Acceptance timing/);
  assert.match(client, /request\.acceptanceRequired \? "Accept vehicle" : "Save changes"/);
  assert.match(client, /value=\{request\.equipmentGroup \|\| request\.equipment \|\| ""\} readOnly/);
  for (const field of ["door", "chassis", "site"]) assert.match(client, new RegExp(`value=\\{request\\.${field}[^>]+readOnly`));
  assert.doesNotMatch(editForm, /name="(?:equipment|door|chassis|site)"/);
  assert.match(client, /!row\.acceptanceRequired \|\| row\.acceptedAt/);
  assert.equal(client.match(/className=\{requestAwaitingAcceptance\(/g)?.length, 2);
  assert.match(workflowCss, /\.request-awaiting-acceptance > td \{\s*background: #f8caca !important;/);
  assert.match(workflowCss, /\.request-awaiting-acceptance > td:first-child \{\s*box-shadow: inset 4px 0 #d92f45;/);
  assert.match(server, /ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ/);
  assert.match(server, /ADD COLUMN IF NOT EXISTS acceptance_required BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(server, /started_at,acceptance_required,status/);
  assert.match(server, /accepted_at=CASE WHEN acceptance_required THEN COALESCE\(accepted_at,NOW\(\)\) ELSE accepted_at END/);
  const editRoute = server.slice(server.indexOf("app.patch('/api/requests/:reference'"), server.indexOf("app.patch('/api/requests/:reference/close'"));
  assert.doesNotMatch(editRoute, /equipment_name=|door_number=|registration_number=|chassis_number=|site=|started_at=/);
  assert.match(server, /AS "acceptedAt"/);
});

test("requests accepted more than one hour after production timing are highlighted red in close form and closed history", () => {
  const start = "2026-09-07 10:00";
  assert.equal(requestAcceptedLate({ start, acceptedAt: "2026-09-07 11:00" }), false);
  assert.equal(requestAcceptedLate({ start, acceptedAt: "2026-09-07 11:01" }), true);
  assert.equal(requestAcceptedLate({ start, acceptedAt: "2026-09-08 09:59", status: "Closed" }), true);
  assert.equal(requestAcceptedLate({ start }), false);
  assert.equal(requestAcceptedLate({}), false);
  const client = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const workflowCss = readFileSync(new URL("../src/mobile-workflow.css", import.meta.url), "utf8");
  assert.match(client, /highlightLateAcceptance && requestAcceptedLate\(row\) \? "request-accepted-late"/);
  assert.match(client, /exportTitle=\{workspaceReportTitles\.close\} showAcceptedTime highlightLateAcceptance/);
  assert.match(client, /rows=\{historyRows\} exportTitle=\{workspaceReportTitles\.history\} highlightLateAcceptance/);
  assert.equal(client.match(/highlightLateAcceptance(?=[\s}])/g)?.length, 4);
  assert.match(workflowCss, /\.request-accepted-late > td \{\s*background: #f8caca !important;/);
  assert.match(workflowCss, /\.request-accepted-late > td:first-child \{\s*box-shadow: inset 4px 0 #d92f45;/);
});
