import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { auditChangedFields, auditDateRange, auditIndiaDateKey, auditRouteDetails, auditSafeError, auditShouldRecord, auditSubmittedFields } from "../audit-trail.mjs";

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
  assert.equal(auditRouteDetails("POST", "/api/requests/bulk-delete").action, "Delete requests");
  assert.deepEqual(auditRouteDetails("POST", "/api/vehicle-transfers"), {module:"Vehicle transfers",eventType:"Vehicle transfer",action:"Submit vehicle transfer"});
  assert.equal(auditRouteDetails("PATCH", "/api/vehicle-transfers/12/source-approval").action, "Release vehicle from source");
  assert.equal(auditRouteDetails("PATCH", "/api/vehicle-transfers/12/destination-verification").action, "Verify vehicle at destination");
  assert.equal(auditRouteDetails("PATCH", "/api/vehicle-transfers/12/destination-acceptance").action, "Accept vehicle at destination");
  assert.equal(auditRouteDetails("PATCH", "/api/tickets/TIC-1").eventType, "CRM");
  assert.equal(auditRouteDetails("PATCH", "/api/requests/REQ-1/verify").action, "Verify request");
  assert.equal(auditRouteDetails("POST", "/api/logout").action, "Logout");
  assert.deepEqual(auditRouteDetails("POST", "/api/backups/export"), {module:"Backup",eventType:"Administration",action:"Export full backup"});
  assert.equal(auditRouteDetails("POST", "/api/backups/import/restore").action, "Restore imported backup");
  assert.equal(auditRouteDetails("DELETE", "/api/backups/109cd88e-85b2-4b2d-b7f5-71fdb9706d3c").action, "Delete backup");
});

test("audit date range defaults to the current India date and validates selections", () => {
  const now=new Date("2026-09-11T20:30:00Z");
  assert.equal(auditIndiaDateKey(now),"2026-09-12");
  assert.deepEqual(auditDateRange({},now),{fromDate:"2026-09-12",toDate:"2026-09-12"});
  assert.deepEqual(auditDateRange({fromDate:"2026-09-08",toDate:"2026-09-11"},now),{fromDate:"2026-09-08",toDate:"2026-09-11"});
  assert.throws(()=>auditDateRange({fromDate:"2026-09-31",toDate:"2026-10-01"},now),/valid From and To/);
  assert.throws(()=>auditDateRange({fromDate:"2026-09-12",toDate:"2026-09-11"},now),/cannot be after/);
});

test("audit errors retain diagnostic context without exposing credentials", () => {
  assert.deepEqual(auditSafeError({code:"23505",message:"password=secret token:abc duplicate row"}), {
    code:"23505",
    message:"password=[protected] token:[protected] duplicate row",
  });
});

test("audit capture records every meaningful user process and all API failures", () => {
  assert.equal(auditShouldRecord("POST", "/api/login"), false);
  assert.equal(auditShouldRecord("POST", "/api/login", {statusCode: 401}), true);
  assert.equal(auditShouldRecord("POST", "/api/logout"), false);
  assert.equal(auditShouldRecord("DELETE", "/api/user-sessions/example-session"), true);
  assert.equal(auditShouldRecord("GET", "/api/user-sessions"), false);
  assert.equal(auditShouldRecord("POST", "/api/backups/run"), true);
  assert.equal(auditShouldRecord("POST", "/api/backups/export"), true);
  assert.equal(auditShouldRecord("POST", "/api/backups/import/inspect"), true);
  assert.equal(auditShouldRecord("POST", "/api/backups/import/restore"), true);
  assert.equal(auditShouldRecord("GET", "/api/backups/109cd88e-85b2-4b2d-b7f5-71fdb9706d3c/download"), true);
  assert.equal(auditShouldRecord("DELETE", "/api/backups/109cd88e-85b2-4b2d-b7f5-71fdb9706d3c"), true);
  assert.equal(auditShouldRecord("GET", "/api/backups"), false);
  assert.equal(auditShouldRecord("POST", "/api/masters/Users%20%26%20employees"), true);
  assert.equal(auditShouldRecord("PUT", "/api/masters/Users%20%26%20employees/1"), true);
  assert.equal(auditShouldRecord("DELETE", "/api/masters/Users%20%26%20employees/1"), true);
  assert.equal(auditShouldRecord("PATCH", "/api/requests/REQ-1"), false);
  assert.equal(auditShouldRecord("DELETE", "/api/requests/REQ-1"), false);
  assert.equal(auditShouldRecord("POST", "/api/requests"), false);
  assert.equal(auditShouldRecord("PATCH", "/api/requests/REQ-1/close"), false);
  assert.equal(auditShouldRecord("PATCH", "/api/requests/REQ-1/verify"), false);
  assert.equal(auditShouldRecord("POST", "/api/requests/REQ-1/daily-remarks"), false);
  assert.equal(auditShouldRecord("PATCH", "/api/tickets/TIC-1"), true);
  assert.equal(auditShouldRecord("POST", "/api/reports/send"), true);
  assert.equal(auditShouldRecord("POST", "/api/session-heartbeat"), false);
  assert.equal(auditShouldRecord("GET", "/api/requests", {statusCode: 503}), true);
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
  assert.match(server, /auditShouldRecord\(req\.method,req\.path,\{statusCode:res\.statusCode\}\)/);
  assert.match(server, /AUDIT_VISIBLE_SCOPE_SQL/);
  assert.match(server, /event_type NOT IN \('Activity','Workflow','Workflow timeline'\)/);
  assert.match(server, /lower\(action\) IN \('login','logout','administrator login','user login'\)/);
  assert.match(server, /if\(auditEventHidden\(eventType,action\)\)return;/);
  assert.match(server, /auditSafeError\(error\)/);
  assert.match(server, /req\.get\?\.\(AUDIT_DEVICE_ID_HEADER\)/);
  assert.match(server, /action:profile\.sessionRole==='super'\?'Administrator login':'User login'/);
  assert.match(server, /app\.get\('\/api\/audit-events',requireSuper/);
  assert.match(server, /auditDateRange\(req\.query\)/);
  assert.match(server, /occurred_at >= \(\$1::date::timestamp AT TIME ZONE 'Asia\/Kolkata'\)/);
  assert.match(server, /occurred_at < \(\(\(\$2::date\+1\)::timestamp\) AT TIME ZONE 'Asia\/Kolkata'\)/);
  assert.match(server, /DELETE FROM audit_events WHERE occurred_at<=\$1/);
  assert.match(server, /mail_confirmed_at=NOW\(\),purged_at=NOW\(\)/);
  assert.match(server, /action:'Administrator password change'/);
  assert.match(client, /function AuditTrailPage/);
  for (const column of ["Date & time", "Event", "User / login", "Role", "Module", "Action", "Target / record", "Source location", "Destination location", "Work completed", "Work pending", "Outcome", "Reason / details", "Changes", "IP address", "App Device ID", "Device type", "Platform", "Browser", "Session ID"])
    assert.match(client, new RegExp(column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(client, /headers\.set\("X-BDMS-Device-ID", clientDeviceId\)/);
  assert.match(client, /label="Device"[\s\S]*label="Platform"/);
  assert.match(client, /Load older audit records/);
  assert.doesNotMatch(client, /Last 10 days/);
  assert.match(client, /params\.set\("fromDate",dateRange\.fromDate\)/);
  assert.match(client, /params\.set\("toDate",dateRange\.toDate\)/);
  assert.match(client, /className="audit-date-range"/);
  assert.match(client, /> Apply dates</);
  assert.match(client, /> Today</);
  assert.match(client, /recordDateFilter=\{false\}/);
  assert.match(client, /HTTP status/);
  assert.match(client, /Error code/);
  assert.match(client, /className="toolbar-actions-end"><div className="master-actions-slot"[\s\S]*?<TableParameterFilter/);
});

test("administrators can delete audit entries older than N days, and the purge is itself recorded", () => {
  assert.match(server, /app\.delete\('\/api\/audit-events',requireSuper,requireAdministrator/);
  assert.match(server, /function housekeepingCutoff\(source=\{\},noun='records'\)/);
  assert.match(server, /if\(!Number\.isInteger\(days\)\|\|days<1\|\|days>AUDIT_PURGE_MAX_DAYS\)return \{error:/, "at least one day is always kept");
  assert.match(server, /if\(upToDate>=auditIndiaDateKey\(\)\)return \{error:`Select a date before today/, "up-to-date deletes stop before today");
  assert.match(server, /const cutoff=new Date\(start\+86400000\);/, "the chosen date is deleted inclusively");
  assert.match(server, /housekeepingCutoff\(\{\.\.\.\(req\.body\|\|\{\}\),\.\.\.req\.query\},'Audit Trail'\)/);
  assert.match(server, /DELETE FROM audit_events WHERE occurred_at<\$1',\[cutoff\.toISOString\(\)\]/);
  assert.match(server, /await appendAuditEvent\(req,\{\s*eventType:'Administration',module:'Audit Trail',action:'Delete old audit logs'/);
  assert.match(server, /res\.json\(\{deleted,\.\.\.window,cutoff:cutoff\.toISOString\(\)\}\)/);
  assert.match(server, /'\/api\/audit-events'\]\.includes\(req\.path\)\)return next\(\);/, "the automatic audit middleware still skips this path, hence the explicit appendAuditEvent");
  assert.match(client, /useState\("2"\), \[purging, setPurging\]/, "the dialog defaults to two days");
  assert.match(client, /> Delete old logs</);
  assert.match(client, /window\.confirm\(`Permanently delete every Audit Trail entry \$\{purgeSelection\.label\}/);
  assert.match(client, /fetch\(`\/api\/audit-events\?\$\{purgeSelection\.query\}`, \{method:"DELETE"/);
  assert.match(client, /function purgeWindow\(\{ mode, days, date \}\)/);
  assert.match(client, /query: `upToDate=\$\{key\}`/, "the dialog can delete up to a chosen date");
  assert.match(client, /query: `olderThanDays=\$\{count\}`/);
  assert.match(client, /if \(key >= indiaDateKey\(\)\) return \{ error: "Select a date before today/, "today can never be chosen");
  assert.match(client, /<DateInput value=\{date\} max=\{yesterdayDateKey\(\)\}/);
  assert.match(client, /Up to a date/);
  assert.match(client, /<PurgeWindowFields mode=\{purgeMode\}/);
  assert.match(client, /<Modal title="Delete old audit logs"/);
  assert.match(client, /Delete permanently/);
  assert.match(client, /setPurgeOpen\(false\);\s+alert\([\s\S]*?\s+load\(\);/, "the list reloads after a purge");
});

test("the Audit Trail is cleaned up automatically once a day, keeping five days unless an administrator changes it", () => {
  assert.match(server, /const LOG_RETENTION_DEFAULTS=Object\.freeze\(\{auditDays:5,activityDays:0\}\);/, "five days of Audit Trail by default; user activity clean-up off until switched on");
  assert.match(server, /async function runLogRetention\(now=new Date\(\)\)/);
  assert.match(server, /if\(retention\.lastRunDate===todayKey\)return \{skipped:true,reason:'already ran today'\};/, "one run per India calendar day");
  assert.match(server, /if\(!retention\.auditDays&&!retention\.activityDays\)return \{skipped:true,reason:'automatic clean-up is off'\};/);
  assert.match(server, /retention\.auditDays\*86400000\)\.toISOString\(\);\r?\n\s+const \{rowCount\}=await pool\.query\('DELETE FROM audit_events WHERE occurred_at<\$1',\[cutoff\]\);/);
  assert.match(server, /DELETE FROM user_login_history WHERE last_seen_at<\$1',\[cutoff\]\);\r?\n\s+const activity=await pool\.query\('DELETE FROM user_session_activity WHERE last_seen_at<\$1',\[cutoff\]\);/);
  assert.match(server, /VALUES \('log_retention_last_run',\$1,NOW\(\)\)/);
  assert.match(server, /const logRetentionTimer=setStaggeredInterval\(\(\)=>\{\r?\n\s+if\(!databaseReady\)return;\r?\n\s+void runAuditedBackendProcess\(\{module:'Audit Trail',action:'Automatic log clean-up'\},\(\)=>runLogRetention\(\)\)/, "every staggered run is itself an audit entry");
  assert.match(server, /\},5\*60\*1000,47_000\);\r?\n\s+logRetentionTimer\.unref\?\.\(\);/);
  assert.match(server, /app\.get\('\/api\/log-retention',requireSuper,requireAdministrator/);
  assert.match(server, /app\.put\('\/api\/log-retention',requireSuper,requireAdministrator/);
  assert.match(server, /if\(auditDays==null\|\|activityDays==null\)return res\.status\(400\)/);
  assert.match(server, /DELETE FROM app_metadata WHERE key='log_retention_last_run'/, "a saved change applies the same day");
  assert.match(server, /action:'Update automatic log clean-up'/);
  assert.match(client, /<Clock \/> Auto clean-up\{retention \? ` · \$\{retentionLabel\(retention\.auditDays\)\}` : ""\}/);
  assert.match(client, /<Modal title="Automatic log clean-up"/);
  assert.match(client, /fetch\("\/api\/log-retention", \{method:"PUT"/);
  assert.match(client, /Audit Trail · days to keep/);
  assert.match(client, /User activity · days to keep/);
});

test("the Audit Trail page stays responsive with hundreds of events", () => {
  const source = client.replace(/\r\n/g, "\n");
  const page = source.slice(source.indexOf("const auditValueCache = new WeakMap();"), source.indexOf("function sessionAgeLabel("));
  assert.match(page, /function auditEventValues\(event\) \{\n  let values = auditValueCache\.get\(event\);/, "display values are computed once per event");
  assert.match(page, /const valueFor = \(event, key\) => auditEventValues\(event\)\[key\] \|\| "—";/, "cells, filters and sorting read the cache");
  assert.doesNotMatch(page, /values=\{\[\.\.\.new Set\(events\.map/, "header value lists are no longer rebuilt for all 26 columns on every render");
  assert.match(page, /values=\{openFilter === key \? headerValuesFor\(key\) : NO_FILTER_VALUES\}/, "only the open column builds its value list, once");
  assert.match(page, /const headerValueCache = useMemo\(\(\) => new Map\(\), \[events\]\);/);
  assert.match(page, /const filtered = useMemo\(\(\) => events\.filter\(/);
  assert.match(page, /const auditTable = useMemo\(\(\) => \(\n\s+<ActionsTable className="audit-table"/, "page state such as dialogs does not re-render the table");
  assert.match(page, /\), \[tableRows, sort, openFilter, filters, actionsToolbarTarget, loading, headerValueCache\]\);/);
  assert.match(page, /\{auditTable\}/);
  assert.match(page, /const AUDIT_PAGE_SIZE = 500;/);
  assert.match(page, /limit:String\(AUDIT_PAGE_SIZE\)/, "smaller pages; older records load on demand");
});
