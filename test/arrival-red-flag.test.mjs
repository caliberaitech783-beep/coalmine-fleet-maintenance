import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildDepartmentReports } from "../department-reports.mjs";

const client = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/mobile-workflow.css", import.meta.url), "utf8");

test("maintenance can red flag only an unreceived vehicle delayed by at least one hour", () => {
  assert.match(server, /ADD COLUMN IF NOT EXISTS arrival_flagged_at TIMESTAMPTZ/);
  assert.match(server, /ADD COLUMN IF NOT EXISTS arrival_flagged_by TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /ADD COLUMN IF NOT EXISTS arrival_flag_remark TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /app\.patch\('\/api\/requests\/:reference\/arrival-flag',requireSession,requirePermission\('editRequests',\{role:'Maintenance User'\}\)/);
  const route = server.slice(server.indexOf("app.patch('/api/requests/:reference/arrival-flag'"), server.indexOf("async function activeRequestConflict"));
  assert.match(route, /acceptance_required=TRUE AND accepted_at IS NULL/);
  assert.match(route, /started_at<=NOW\(\)-INTERVAL '1 hour'/);
  assert.match(route, /status NOT IN \('Closed','Idle','Ideal'\)/);
  assert.match(route, /arrival_flagged_at IS NULL/);
  assert.match(route, /arrival_flagged_at=NOW\(\),arrival_flagged_by=\$1/);
  assert.match(route, /outside your assigned maintenance location/);
});

test("the red flag action precedes Edit and flagged requests stay idempotent", () => {
  const actions = client.slice(client.indexOf("const workflowActions"), client.indexOf("useEffect(() =>", client.indexOf("const workflowActions")));
  assert.ok(actions.indexOf("arrival-red-flag") < actions.indexOf("<Pencil /> Edit"));
  assert.match(actions, /requestAwaitingAcceptance\(row, now\) && !row\.arrivalFlaggedAt/);
  assert.match(actions, /row\.arrivalFlaggedAt/);
  assert.match(actions, /View red flag/);
  assert.match(client, /onFlagArrival=\{permissions\.editRequests \? setArrivalFlagging : null\}/);
  assert.match(client, /action === "arrival-flag" \? `\/api\/requests\/\$\{encodeURIComponent\(reference\)\}\/arrival-flag`/);
  assert.match(styles, /button\.arrival-red-flag\{[^}]*background:#c9253d/);
});

test("the Reports section includes saved arrival reasons and keeps legacy flags readable", () => {
  const saved={ref:'REQ-FLAG',start:'2026-09-08 08:00:00',arrivalFlaggedAt:'2026-09-08 10:00:00',arrivalFlaggedBy:'Maintenance inspector',arrivalFlagRemark:'Recovery vehicle not available',site:'Sasti OB'};
  const legacy={...saved,ref:'REQ-LEGACY',arrivalFlagRemark:''};
  const reports=buildDepartmentReports({requests:[saved,legacy,{ref:'REQ-NO-FLAG'}],now:new Date('2026-09-08T06:30:00Z')});
  const report=reports.find(report=>report.title==='Vehicle Arrival Red Flag Report');
  assert.ok(report);
  assert.deepEqual(report.rows.map(row=>row.ref).sort(),['REQ-FLAG','REQ-LEGACY']);
  const remark=report.columns.find(column=>column.key==='arrivalFlagRemark');
  assert.ok(remark);
  assert.equal(remark.value(saved),'Recovery vehicle not available');
  assert.equal(remark.value(legacy),'No remark recorded');
  assert.equal(report.dateValue(saved),saved.arrivalFlaggedAt);
  assert.ok(reports.some(report=>report.title==='MIS Red Flag Report'));
  assert.match(server, /arrival_flag_remark AS "arrivalFlagRemark"/);
});
