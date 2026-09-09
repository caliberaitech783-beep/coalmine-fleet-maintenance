import test from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_BACKUP_SETTINGS, SYSTEM_ADMINISTRATION_OPTIONS, normalizeBackupSettings, scheduledBackupDue} from "../system-administration.mjs";

test("system administration includes audit trail and requested backup/session tools", () => {
  for (const item of ["Daily Backup", "Backup History", "Export Backup", "Create Schedule Backup", "Backup Settings", "Storage and Retention", "Backup Activity Logs", "Login Sessions", "Login History", "Device Access", "Audit Trail"])
    assert.ok(SYSTEM_ADMINISTRATION_OPTIONS.includes(item));
});

test("backup settings are bounded and normalized", () => {
  const settings = normalizeBackupSettings({scheduleTime:"99:88", retentionDays:0, maxBackups:999, weekdays:["Monday", "Noday"], namePrefix:"BDMS backup !"});
  assert.equal(settings.scheduleTime, DEFAULT_BACKUP_SETTINGS.scheduleTime);
  assert.equal(settings.retentionDays, 30);
  assert.equal(settings.maxBackups, 365);
  assert.deepEqual(settings.weekdays, ["Monday"]);
  assert.equal(settings.namePrefix, "BDMS-backup-");
});

test("scheduled backup becomes due after its configured IST time", () => {
  const settings = normalizeBackupSettings({scheduleTime:"02:00", weekdays:["Wednesday"]});
  assert.equal(scheduledBackupDue(settings, new Date("2026-09-08T20:31:00Z")), true);
  assert.equal(scheduledBackupDue(settings, new Date("2026-09-08T19:00:00Z")), false);
});
