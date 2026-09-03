import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { auditChangedFields, auditRouteDetails, auditSubmittedFields } from "../audit-trail.mjs";

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
});

test("audit routes classify security, master, workflow, and CRM activity", () => {
  assert.equal(auditRouteDetails("POST", "/api/login").eventType, "Security");
  assert.equal(auditRouteDetails("PUT", "/api/masters/Users%20%26%20employees/1").module, "Users & employees");
  assert.equal(auditRouteDetails("DELETE", "/api/requests/REQ-1").action, "Delete request");
  assert.equal(auditRouteDetails("PATCH", "/api/tickets/TIC-1").eventType, "CRM");
});

test("server persists append-only audit events and exposes the detailed report", () => {
  assert.match(server, /CREATE TABLE IF NOT EXISTS audit_events/);
  assert.match(server, /res\.on\('finish',[\s\S]*appendAuditEvent/);
  assert.match(server, /headers\?\.\['x-forwarded-for'\][\s\S]*auditIpAddress\(req\)/);
  assert.match(server, /device_id TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /req\.get\?\.\(AUDIT_DEVICE_ID_HEADER\)/);
  assert.match(server, /action:profile\.sessionRole==='super'\?'Administrator login':'User login'/);
  assert.match(server, /app\.get\('\/api\/audit-events',requireSuper/);
  assert.match(server, /action:'Administrator password change'/);
  assert.match(client, /function AuditTrailPage/);
  for (const column of ["Date & time", "Event", "User / login", "Role", "Module", "Action", "Target / record", "Outcome", "Reason / details", "Changes", "IP address", "App Device ID", "Device type", "Platform", "Browser", "Session ID"])
    assert.match(client, new RegExp(column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(client, /headers\.set\("X-BDMS-Device-ID", clientDeviceId\)/);
  assert.match(client, /label="Device"[\s\S]*label="Platform"/);
  assert.match(client, /className="toolbar-actions-end"><div className="master-actions-slot"[\s\S]*?<TableParameterFilter/);
});
