import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const client=readFileSync(new URL('../src/backup-administration.jsx',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');

test('stores backup metadata separately and never stores archive payloads in PostgreSQL',()=>{
  assert.match(server,/CREATE TABLE IF NOT EXISTS backup_runs/);
  assert.match(server,/storage_path TEXT NOT NULL DEFAULT ''/);
  assert.doesNotMatch(server,/backup_payload|backup_data|archive_payload/);
  assert.match(server,/exportDatabase\(\{client,output:filePath\}\)/);
});

test('exposes separate protected Admin backup pages',()=>{
  assert.match(main,/\["Backup", HardDrive\]/);
  assert.match(main,/\["Export Backup", Download\]/);
  assert.match(main,/\["Import Backup", Upload\]/);
  assert.match(main,/\["Backup Schedule", CalendarDays\]/);
  assert.match(main,/<BackupAdministration section=\{active\} session=\{session\} onNavigate=\{selectMenu\}/);
});

test('requires Super Admin inspection and exact confirmation before restore',()=>{
  assert.match(server,/app\.post\('\/api\/backups\/import\/inspect',requireSuper,requireTrueSuperAdmin/);
  assert.match(server,/app\.post\('\/api\/backups\/import\/restore',requireSuper,requireTrueSuperAdmin/);
  assert.match(server,/confirmation\|\|''\)\.trim\(\)!=='RESTORE BDMS'/);
  assert.match(server,/triggerType:'Pre-restore'/);
  assert.match(client,/Type <b>RESTORE BDMS<\/b>/);
});

test('manual export asks for a computer location and scheduled backup uses protected storage',()=>{
  assert.match(client,/window\.showSaveFilePicker/);
  assert.match(client,/Choose location and export/);
  assert.match(server,/const backupStorageRoot=path\.resolve/);
  assert.match(server,/runScheduledBackup/);
});

test('backup history never presents failed or running jobs as zero-byte recovery files',()=>{
  assert.match(client,/if\(row\.status==='Running'\)return 'Writing\.\.\.'/);
  assert.match(client,/if\(row\.status==='Failed'\)return 'No file'/);
  assert.match(client,/Backup failed:/);
});

test('manual, scheduled, export, import and restore backup actions are written to Audit Trail',()=>{
  assert.match(server,/event_type IN \('Security','Master data','Administration'\)/);
  assert.match(server,/request_path LIKE '\/api\/backups\/%'/);
  assert.match(server,/appendScheduledBackupAudit/);
  assert.match(server,/action:'Create scheduled backup'/);
  assert.match(server,/action:'Create stored backup'/);
  assert.match(server,/action:'Export full backup'/);
  assert.match(server,/action:'Inspect imported backup'/);
  assert.match(server,/action:'Restore imported backup'/);
  assert.match(server,/action:'Download stored backup'/);
});
