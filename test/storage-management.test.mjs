import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PURGEABLE_TABLES, deadRowShare, diskState, sharePercent, tableLabel } from "../storage-management.mjs";
import { HOUSEKEEPING_CATEGORIES } from "../data-housekeeping.mjs";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("tables get plain names, unknown ones a readable fallback", () => {
  assert.equal(tableLabel("audit_events"), "Audit Trail");
  assert.equal(tableLabel("some_new_table"), "Some new table");
});

test("shares, dead rows and disk status", () => {
  assert.equal(sharePercent(25, 200), 12.5);
  assert.equal(sharePercent(5, 0), 0);
  assert.equal(deadRowShare(750, 250), 25);
  assert.equal(deadRowShare(0, 40), 0, "empty statistics after a restart are not reported as freed space");
  assert.deepEqual(diskState(100, 50), { status: "ok", usedPercent: 50 });
  assert.equal(diskState(100, 15).status, "warn");
  assert.equal(diskState(100, 5).status, "fail");
  assert.equal(diskState(0, 0).status, "off");
});

test("every table Purge data can touch is marked as purgeable", () => {
  for (const table of HOUSEKEEPING_CATEGORIES.flatMap((category) => category.tables)) assert.ok(PURGEABLE_TABLES.has(table), table);
});

test("Storage management is an Admin-only, read-only page in the Database clock", () => {
  assert.ok(server.includes("app.get('/api/storage-overview',requireSuper,requireAdministrator,"));
  assert.ok(!/app\.(post|put|delete)\('\/api\/storage-overview/.test(server));
  assert.ok(source.includes('["Storage management", HardDrive]'));
  assert.ok(source.includes("<StorageManagementPage token={authToken} onNavigate={selectMenu} />"));
});
