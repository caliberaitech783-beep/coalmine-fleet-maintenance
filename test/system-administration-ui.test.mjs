import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const ui = fs.readFileSync(new URL("../src/system-administration.jsx", import.meta.url), "utf8");
const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("Audit Trail is moved into the System Administration menu", () => {
  assert.match(main, /System Administration<\/span>/);
  assert.doesNotMatch(main.match(/const nav = \[[\s\S]*?\];/)?.[0] || "", /Audit Trail/);
  assert.match(main, /SystemAdministrationPage/);
});

test("backup administration supports creation, export, schedules, retention, and activity", () => {
  for (const route of ["/api/system-admin/backups", "/api/system-admin/backup-settings", "/api/system-admin/backup-activity"])
    assert.ok(server.includes(route));
  assert.match(ui, /Create backup now/);
  assert.match(ui, /Run on weekdays/);
  assert.match(ui, /Retention period \(days\)/);
  assert.match(server, /X-BDMS-Checksum-SHA256/);
  assert.match(server, /CREATE TABLE IF NOT EXISTS system_backup_chunks/);
  assert.match(server, /BACKUP_CHUNK_TARGET_BYTES/);
  assert.match(server, /res\.write\(`\$\{JSON\.stringify\(documentHeader\)/);
  assert.doesNotMatch(server, /data\[table\]=sanitizeBackupValue\(rows\)/);
});

test("session administration uses a non-secret public id and requires a force-close reason", () => {
  assert.match(server, /session_public_id/);
  assert.match(server, /Enter a reason for forcefully closing this session/);
  assert.match(ui, /row\.device\?\.platform/);
  assert.match(ui, /row\.device\?\.browser/);
  assert.match(ui, /Force close/);
});

test("remote support requires target approval before an administrator can start it", () => {
  assert.match(server, /Only the requested employee can approve or decline device access/);
  assert.match(server, /action==='start'&&support\.status==='Approved'/);
  assert.match(ui, /Approve & open/);
  assert.match(ui, /ms-quick-assist:/);
});
