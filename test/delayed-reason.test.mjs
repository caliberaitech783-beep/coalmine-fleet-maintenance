import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {DELAYED_REASON_DEFAULTS,delayedReasonRequired} from '../delayed-reason.mjs';

test('Delayed Reason master contains the approved starting values',()=>{
  assert.deepEqual(DELAYED_REASON_DEFAULTS,[
    'Parts - OEM',
    'Parts - CMLL',
    'Tools NA - OEM',
    'Tools NA - CMLL',
    'Repair in progress - OEM',
    'Repair in progress - CMLL',
    'Approval - OEM',
    'Approval - CMLL',
    'Fault Diagnosis - OEM',
    'Acc- Insurance Survey-OEM',
    'Acc- Insurance Survey-CMLL',
    'Acc- Insurance Approval-CMLL',
    'Acc- Insurance Approval-OEM',
    'Acc- Repair Estimate-CMLL',
    'Acc- Repair Estimate-OEM',
    'Superstructure - Parts',
    'Superstructure - Manpower',
    'Superstructure - Repair',
    'Manpower shortage - OEM',
    'Manpower shortage - CMLL',
  ]);
});

test('a delayed reason becomes mandatory four hours after ETC',()=>{
  const etc='2026-09-06 10:00';
  assert.equal(delayedReasonRequired(etc,'2026-09-06 13:59'),false);
  assert.equal(delayedReasonRequired(etc,'2026-09-06 14:00'),true);
  assert.equal(delayedReasonRequired('',new Date()),false);
});

test('Delayed Reason master, close form, and server validation are connected',()=>{
  const client=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const access=fs.readFileSync(new URL('../admin-access.mjs',import.meta.url),'utf8');
  assert.match(access,/"Region master",\s*"Delayed Reason",\s*"Vehicle transfers"/);
  assert.match(client,/\["Region master", Building2\],\s*\["Delayed Reason", Clock\],\s*\["Vehicle transfers", ArrowRightLeft\]/);
  assert.match(client,/useMasterRecords\("Delayed Reason"\)/);
  assert.match(client,/masterAccessAllows\(viewPermissions, name\)/);
  assert.match(server,/masterAccessAllows\(session\.permissions,requestedMaster\)/);
  assert.match(client,/Add custom delayed reason/);
  assert.match(client,/delayedReasonRequired\(request\.expectedCompletionAt,closingAt\)/);
  assert.match(server,/delayed_reason TEXT NOT NULL DEFAULT ''/);
  assert.match(server,/delayedReasonRequired\(meterRows\[0\]\.expected_completion_at,closedAt\)/);
  assert.match(server,/Select a delayed reason because this request is being closed at least 4 hours after ETC/);
  assert.match(server,/INSERT INTO master_records \(master_name,record_data\)[\s\S]*SELECT 'Delayed Reason'/);
  assert.match(server,/canViewDelayedReasons[\s\S]*permissions\?\.closeRequests===true/);
});
