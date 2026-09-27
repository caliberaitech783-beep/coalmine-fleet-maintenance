import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HOUSEKEEPING_CATEGORIES, housekeepingCategory, purgeRequestError } from "../data-housekeeping.mjs";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("only logs, delivery history, notifications and old media can be purged", () => {
  assert.deepEqual(HOUSEKEEPING_CATEGORIES.map((category) => category.key), ["audit", "activity", "deliveries", "notifications", "media"]);
  const tables = new Set(HOUSEKEEPING_CATEGORIES.flatMap((category) => category.tables));
  for (const business of ["equipment", "tickets", "master_records", "app_users"]) assert.ok(!tables.has(business), business);
  for (const category of HOUSEKEEPING_CATEGORIES) {
    assert.ok(category.count.includes("<$1"), `${category.key} counts only rows before the cutoff`);
    for (const statement of category.purge) assert.ok(statement.includes("<$1"), `${category.key} purges only rows before the cutoff`);
  }
  // Media is cleared, never the request row, and only after MIS verification.
  assert.match(housekeepingCategory("media").purge[0], /^UPDATE maintenance_requests SET/);
  assert.match(housekeepingCategory("media").purge[0], /verified_at IS NOT NULL/);
  // Undismissed messages from an administrator stay.
  assert.match(housekeepingCategory("notifications").purge[1], /dismissed_at IS NOT NULL/);
});

test("each category follows the matching automatic clean-up setting", () => {
  assert.deepEqual(HOUSEKEEPING_CATEGORIES.map((category) => category.retentionKey), ["auditDays", "activityDays", "whatsappDays", "notificationDays", "mediaDays"]);
});

test("a purge needs a known category, a reason and a typed DELETE", () => {
  assert.match(purgeRequestError({ category: "equipment", reason: "cleanup", confirmation: "DELETE" }), /Choose what to purge/);
  assert.match(purgeRequestError({ category: "audit", reason: "x", confirmation: "DELETE" }), /reason/);
  assert.match(purgeRequestError({ category: "audit", reason: "storage full", confirmation: "yes" }), /Type DELETE/);
  assert.equal(purgeRequestError({ category: "audit", reason: "storage full", confirmation: " delete " }), "");
});

test("Retention rules and Purge data are Admin-only pages in the Database clock", () => {
  for (const route of ["app.get('/api/data-housekeeping',requireSuper,requireAdministrator,", "app.post('/api/data-housekeeping/purge',requireSuper,requireAdministrator,", "app.post('/api/log-retention/run',requireSuper,requireAdministrator,"]) assert.ok(server.includes(route), route);
  assert.ok(server.includes("const invalid=purgeRequestError(body);"));
  assert.ok(source.includes('const databaseToolPages = new Set(["Diagnostics", "Retention rules", "Purge data"]);'));
  assert.ok(source.includes('["Retention rules", CalendarClock], ["Purge data", Eraser]];'));
  assert.ok(source.includes("<RetentionRulesPage token={authToken} />"));
  assert.ok(source.includes("<PurgeDataPage token={authToken} />"));
});
