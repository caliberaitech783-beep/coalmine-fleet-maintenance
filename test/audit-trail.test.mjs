import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { auditChangedFields, auditRouteDetails, auditSafeError, auditShouldRecord, auditSubmittedFields } from "../audit-trail.mjs";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const client = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("audit field summaries show changes without exposing credentials or media", () => {
  assert.deepEqual(auditChangedFields(
    { employee: "Old Name", passwordHash: "old-secret" },
    { employee: "New Name", passwordHash: "new-secret" },
  ), [
    { field: "employee", before: "Old Name", after: "New Name" },
    { field: "passwordHash", before: "[protected]", after: "[protected]" },
  ]);
  assert.deepEqual(auditSubmittedFields({ accessToken: "secret", attachmentData: "bytes" }), [
    { field: "accessToken", before: "", after: "[protected]" },
    { field: "attachmentData", before: "", after: "[protected]" },
  ]);
  assert.deepEqual(auditSubmittedFields({record:{login:"operator",passwordHash:"nested-secret"}}), [
    {field:"record",before:"",after:'{"login":"operator","passwordHash":"[protected]"}'},
  ]);
});

test("audit routes classify security, master, workflow, and CRM activity", () => {
  assert.equal(auditRouteDetails("POST", "/api/login").eventType, "Security");
  assert.equal(auditRouteDetails("DELETE", "/api/user-sessions/example-session").action, "Force close session");
  assert.equal(auditRouteDetails("PUT", "/api/masters/Users%20%26%20employees/1").module, "Users & employees");
  assert.equal(auditRouteDetails("DELETE", "/api/requests/REQ-1").action, "Delete request");
  assert.equal(auditRouteDetails("PATCH", "/api/tickets/TIC-1").eventType, "CRM");
  assert.equal(auditRouteDetails("PATCH", "/api/requests/REQ-1/verify").action, "Verify request");
  assert.equal(auditRouteDetails("POST", "/api/logout").action, "Logout");
});

test("audit errors retain diagnostic context without exposing credentials", () => {
  assert.deepEqual(auditSafeError({code:"23505",message:"password=secret token:abc duplicate row"}), {
    code:"23505",
    message:"password=[protected] token:[protected] duplicate row",
  });
});

test("audit capture keeps administration and direct record changes out of routine workflow", () => {
  assert.equal(auditShouldRecord("POST", "/api/login"), true);
  assert.equal(auditShouldRecord("DELETE", "/api/user-sessions/example-session"), true);
  assert.equal(auditShouldRecord("GET", "/api/user-sessions"), false);
  assert.equal(auditShouldRecord("POST", "/api/masters/Users%20%26%20employees"), true);
  assert.equal(auditShouldRecord("PUT", "/api/masters/Users%20%26%20employees/1"), true);
  assert.equal(auditShouldRecord("DELETE", "/api/masters/Users%20%26%20employees/1"), true);
  assert.equal(auditShouldRecord("PATCH", "/api/requests/REQ-1"), true);
  assert.equal(auditShouldRecord("DELETE", "/api/requests/REQ-1"), true);
  assert.equal(auditShouldRecord("POST", "/api/requests"), false);
  assert.equal(auditShouldRecord("PATCH", "/api/requests/REQ-1/close"), false);
  assert.equal(auditShouldRecord("PATCH", "/api/requests/REQ-1/verify"), false);
  assert.equal(auditShouldRecord("POST", "/api/requests/REQ-1/daily-remarks"), false);
  assert.equal(auditShouldRecord("PATCH", "/api/tickets/TIC-1"), false);
  assert.equal(auditShouldRecord("POST", "/api/reports/send"), false);
});

test("server persists append-only audit events and exposes the detailed report", () => {
  assert.match(server, /CREATE TABLE IF NOT EXISTS audit_events/);
  assert.match(server, /res\.on\('finish',[\s\S]*appendAuditEvent/);
  assert.match(server, /headers\?\.\['x-forwarded-for'\][\s\S]*auditIpAddress\(req\)/);
  assert.match(server, /device_id TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /request_method TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /status_code INTEGER/);
  assert.match(server, /duration_ms INTEGER NOT NULL DEFAULT 0/);
  assert.match(server, /error_code TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /app\.post\('\/api\/logout',requireSession/);
  assert.match(server, /auditShouldRecord\(req\.method,req\.path\)/);
  assert.match(server, /AUDIT_VISIBLE_SCOPE_SQL/);
  assert.match(server, /event_type NOT IN \('Workflow','Workflow timeline'\)/);
  assert.match(server, /action IN \('Edit request','Delete request'\)/);
  assert.match(server, /auditSafeError\(error\)/);
  assert.match(server, /req\.get\?\.\(AUDIT_DEVICE_ID_HEADER\)/);
  assert.match(server, /action:profile\.sessionRole==='super'\?'Administrator login':'User login'/);
  assert.match(server, /app\.get\('\/api\/audit-events',requireSuper/);
  assert.match(server, /occurred_at >= NOW\(\)-INTERVAL '5 days'/);
  assert.match(server, /DELETE FROM audit_events WHERE occurred_at<NOW\(\)-INTERVAL '5 days'/);
  assert.match(server, /action:'Administrator password change'/);
  assert.match(client, /function AuditTrailPage/);
  for (const column of ["Date & time", "Event", "User / login", "Role", "Module", "Action", "Target / record", "Outcome", "Reason / details", "Changes", "IP address", "App Device ID", "Device type", "Platform", "Browser", "Session ID"])
    assert.match(client, new RegExp(column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(client, /headers\.set\("X-BDMS-Device-ID", clientDeviceId\)/);
  assert.match(client, /label="Device"[\s\S]*label="Platform"/);
  assert.match(client, /Load older audit records/);
  assert.doesNotMatch(client, /auditDefaultDateRange/);
  assert.doesNotMatch(client, /Last 10 days/);
  assert.doesNotMatch(client, /params\.set\("fromDate",fromDate\)/);
  assert.doesNotMatch(client, /params\.set\("toDate",toDate\)/);
  assert.match(client, /recordDateFilter=\{false\}/);
  assert.match(client, /HTTP status/);
  assert.match(client, /Error code/);
  assert.match(client, /className="toolbar-actions-end"><div className="master-actions-slot"[\s\S]*?<TableParameterFilter/);
});
