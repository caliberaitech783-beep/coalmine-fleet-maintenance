import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { backupDiagnostic, deliveryDiagnostic, diagnosticState, formatBytes, runDiagnostic, runDiagnostics } from "../system-diagnostics.mjs";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("each check reports ok, warn, fail or off and never hangs", async () => {
  assert.equal((await runDiagnostic({ key: "a", label: "A", run: async () => ({ detail: "fine" }) })).status, "ok");
  assert.equal((await runDiagnostic({ key: "b", label: "B", run: async () => ({ status: "warn", detail: "old" }) })).status, "warn");
  assert.deepEqual((await runDiagnostic({ key: "c", label: "C", run: async () => { throw new Error("down"); } })).detail, "down");
  assert.equal((await runDiagnostic({ key: "d", label: "D", run: async () => diagnosticState("off", "not set up") })).status, "off");
  const slow = await runDiagnostic({ key: "e", label: "E", run: () => new Promise(() => {}) }, { timeoutMs: 20 });
  assert.equal(slow.status, "fail");
  assert.match(slow.detail, /No answer within/);
});

test("the overall state is the worst check", async () => {
  const report = await runDiagnostics([
    { key: "a", label: "A", run: async () => ({}) },
    { key: "b", label: "B", run: async () => ({ status: "warn" }) },
    { key: "c", label: "C", run: async () => diagnosticState("off", "") },
  ]);
  assert.equal(report.overall, "warn");
  assert.deepEqual(report.summary, { ok: 1, warn: 1, fail: 0, off: 1 });
});

test("backups older than a day, failed or missing need attention", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  assert.equal(backupDiagnostic(null, now).status, "warn");
  assert.equal(backupDiagnostic({ status: "Completed", completedAt: "2026-09-28T02:00:00Z" }, now).status, "ok");
  assert.equal(backupDiagnostic({ status: "Completed", completedAt: "2026-09-26T02:00:00Z" }, now).status, "warn");
  assert.match(backupDiagnostic({ status: "Failed", completedAt: "2026-09-28T11:00:00Z", errorMessage: "disk full" }, now).detail, /disk full/);
});

test("failed message deliveries surface the latest reason, such as an empty wallet", () => {
  assert.equal(deliveryDiagnostic({ sent: 10, failed: 0 }).status, "ok");
  const empty = deliveryDiagnostic({ sent: 0, failed: 12, lastError: "Failed - Insufficient wallet balance" });
  assert.equal(empty.status, "fail");
  assert.match(empty.detail, /Insufficient wallet balance/);
  assert.equal(deliveryDiagnostic({ sent: 20, failed: 2, lastError: "x" }).status, "warn");
  assert.equal(formatBytes(1536), "1.5 KB");
});

test("Diagnostics is an Admin-only page in the Database clock", () => {
  assert.ok(server.includes("app.get('/api/diagnostics',requireSuper,requireAdministrator,"));
  for (const key of ["app", "database", "backups", "oracle", "telegram", "whatsapp", "email"]) assert.ok(server.includes(`{key:'${key}',label:`), key);
  assert.ok(source.includes('const adminDatabaseNav = [...adminNav.filter(([name]) => backupAdminPages.has(name)), ["Diagnostics", Stethoscope], ["Storage management", HardDrive], ["Retention rules", CalendarClock], ["Purge data", Eraser]];'));
  assert.ok(source.includes('if(backupAdminPages.has(name)||databaseToolPages.has(name))return isAdministrator;'));
  assert.ok(source.includes('active === "Diagnostics" ? (\n            <DiagnosticsPage token={authToken} />') || source.includes('active === "Diagnostics" ? (\r\n            <DiagnosticsPage token={authToken} />'));
});
