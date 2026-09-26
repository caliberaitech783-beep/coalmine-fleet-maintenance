import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {SHIFT_MASTER_DEFAULTS,normalizeShiftRecord,shiftDurationMinutes,shiftIdentity} from '../shift-master.mjs';
import {displaySiteName,normalizeOperationalSiteFields} from '../region-scope.mjs';

test('supplied Shift Master workbook rows are represented once with valid eight-hour shifts',()=>{
  assert.equal(SHIFT_MASTER_DEFAULTS.length,18);
  const normalized=SHIFT_MASTER_DEFAULTS.map(normalizeShiftRecord);
  assert.equal(new Set(normalized.map(shiftIdentity)).size,18);
  assert.ok(normalized.every((record)=>record.status==='Active'));
  assert.ok(normalized.every((record)=>shiftDurationMinutes(record)===480));
  assert.equal(normalized.find((record)=>record.site==='Jayant OB'&&record.shiftCode==='A').startTime,'04:00:00');
  assert.equal(normalized.find((record)=>record.site==='Sasti OB'&&record.shiftCode==='C').endTime,'05:00:00');
});

test('Shift Master accepts workbook headers, normalizes time, and validates effective dates',()=>{
  const normalized=normalizeShiftRecord({siteName:'Majri OB',shift:'Shift A',start:'5:00',end:'13:00',effectiveFrom:'15-09-2026',effectiveTo:'30-09-2026',remarks:'Day shift'});
  assert.deepEqual(normalized,{
    site:'Majri OB',shiftName:'Shift A',shiftCode:'A',startTime:'05:00:00',endTime:'13:00:00',
    effectiveFrom:'2026-09-15',effectiveTo:'2026-09-30',status:'Active',remarks:'Day shift',
  });
  assert.equal(normalizeShiftRecord({...normalized,startTime:'7:05 PM'}).startTime,'19:05:00');
  assert.throws(()=>normalizeShiftRecord({...normalized,effectiveTo:'14-09-2026'}),/cannot be before/);
  assert.throws(()=>normalizeShiftRecord({...normalized,startTime:'25:00'}),/valid time/);
  assert.equal(displaySiteName(normalizeOperationalSiteFields({site:'Gouri OB'}).site),'Gauri Pauni OB (2nd)');
});

test('Shift Master is wired into navigation, CRUD, seed data, and Equipment Master hides Sync Oracle',()=>{
  const client=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  assert.match(client,/\["Shift Master", Clock, "shift"\]/);
  assert.match(client,/"Shift Master": \[/);
  assert.match(client,/name === "Shift Master" \? privilegeSiteOptions/);
  assert.match(client,/name === "Vehicle transfers" && \(/);
  assert.doesNotMatch(client,/\["Equipment master", "Vehicle transfers"\]\.includes\(name\)/);
  assert.match(server,/shift_master_defaults_seeded_v1/);
  assert.match(server,/master==='Equipment master'\|\|master==='Shift Master'/);
  assert.match(server,/normalizeShiftRecord\(record\)/);
});
