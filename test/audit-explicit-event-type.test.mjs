import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AUDIT_HIDDEN_EVENT_TYPES, auditRouteDetails, auditShouldRecord } from "../audit-trail.mjs";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("a visible req.audit event type is recorded even when the route default is Activity", () => {
  assert.equal(auditRouteDetails("PUT", "/api/log-retention").eventType, "Activity");
  assert.equal(auditShouldRecord("PUT", "/api/log-retention", {statusCode: 200}), false);
  assert.equal(auditShouldRecord("PUT", "/api/log-retention", {statusCode: 200, eventType: "Configuration"}), true);
  assert.equal(auditShouldRecord("DELETE", "/api/user-login-history", {statusCode: 200, eventType: "Administration"}), true);
  assert.equal(auditShouldRecord("POST", "/api/telegram/test", {statusCode: 200, eventType: "Integration"}), true);
  assert.equal(auditShouldRecord("GET", "/api/backups/pc-download/latest", {statusCode: 200, eventType: "Administration"}), true);
});

test("hidden event types and the fixed exclusions stay unrecorded", () => {
  for (const eventType of AUDIT_HIDDEN_EVENT_TYPES) {
    assert.equal(auditShouldRecord("PUT", "/api/log-retention", {statusCode: 200, eventType}), false);
  }
  assert.equal(auditShouldRecord("PATCH", "/api/requests/R-1/mis-flag", {statusCode: 200, eventType: "Workflow"}), false);
  assert.equal(auditShouldRecord("POST", "/api/logout", {statusCode: 200, eventType: "Security"}), false);
  assert.equal(auditShouldRecord("POST", "/api/session-heartbeat", {statusCode: 200, eventType: "Security"}), false);
  assert.equal(auditShouldRecord("POST", "/api/session-heartbeat", {statusCode: 500, eventType: "Security"}), false);
  assert.equal(auditShouldRecord("PUT", "/api/log-retention", {statusCode: 500}), true);
});

test("the audit middleware passes the handler's event type and shares the hidden list", () => {
  assert.match(server, /auditShouldRecord\(req\.method,req\.path,\{statusCode:res\.statusCode,eventType:req\.audit\?\.eventType\}\)/);
  assert.doesNotMatch(server, /const AUDIT_HIDDEN_EVENT_TYPES=/);
  assert.match(server, /import \{AUDIT_HIDDEN_EVENT_TYPES,/);
});

test("remote scroll and input commands are not audited, clicks are", () => {
  assert.match(server, /req\.audit=commandType!=='click'\?false:\{eventType:'Security',module:'Remote assistance'/);
});
