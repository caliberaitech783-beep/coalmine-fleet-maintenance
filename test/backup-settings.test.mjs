import test from 'node:test';
import assert from 'node:assert/strict';
import {BACKUP_WEEKDAYS,DEFAULT_BACKUP_SETTINGS,indiaBackupSlot,normalizeBackupSettings,scheduledBackupDue} from '../backup-settings.mjs';

test('normalizes backup schedule, retention, and a safe relative folder',()=>{
  assert.deepEqual(normalizeBackupSettings({
    enabled:false,scheduleTime:'23:45',weekdays:['Monday','Monday','Friday','Never'],
    storageFolder:'../Finance Reports/../../Nightly',retentionDays:999,maxBackups:0,
  }),{
    enabled:false,scheduleTime:'23:45',weekdays:['Monday','Friday'],storageFolder:'Finance-Reports/Nightly',
    retentionDays:365,maxBackups:DEFAULT_BACKUP_SETTINGS.maxBackups,
  });
  assert.deepEqual(normalizeBackupSettings({weekdays:[]}).weekdays,BACKUP_WEEKDAYS);
});

test('calculates one India-time backup slot per calendar day',()=>{
  const slot=indiaBackupSlot(new Date('2026-09-10T20:30:05Z'));
  assert.deepEqual(slot,{date:'2026-09-11',weekday:'Friday',time:'02:00',slotKey:'2026-09-11'});
});

test('runs only on selected weekdays after the configured India time',()=>{
  const settings={enabled:true,scheduleTime:'02:00',weekdays:['Friday']};
  assert.equal(scheduledBackupDue(settings,new Date('2026-09-10T20:29:59Z')),false);
  assert.equal(scheduledBackupDue(settings,new Date('2026-09-10T20:30:00Z')),true);
  assert.equal(scheduledBackupDue({...settings,enabled:false},new Date('2026-09-10T21:00:00Z')),false);
  assert.equal(scheduledBackupDue({...settings,weekdays:['Saturday']},new Date('2026-09-10T21:00:00Z')),false);
});
