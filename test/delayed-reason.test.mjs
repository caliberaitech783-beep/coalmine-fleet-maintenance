import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {DELAYED_REASON_DEFAULTS,delayedReasonRequired} from '../delayed-reason.mjs';

test('maintenance request delayed reasons use searchable master choices and a scoped update',()=>{
  const client=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const form=client.slice(client.indexOf('function DelayedReasonForm'),client.indexOf('function DailyRemarkForm'));
  assert.match(form,/useMasterRecords\("Delayed Reason"\)/);
  assert.match(form,/matchesSmartSearch\(query, option\)/);
  assert.match(form,/Add custom reason/);
  assert.match(form,/await onSave\(reason.trim\(\)\)/);
  assert.match(client,/onDelayedReason=\{permissions.editRequests \? setDelaying : null\}/);
  const route=server.slice(server.indexOf("app.patch('/api/requests/:reference/delayed-reason'"),server.indexOf('app.use(express.static(staticRoot))'));
  assert.match(route,/requirePermission\('editRequests',\{role:'Maintenance User'\}\)/);
  assert.match(route,/withMaintenanceArrivalGuard/);
  assert.match(route,/delayedReason.length>160/);
  assert.match(route,/SET delayed_reason=\$1 WHERE reference=\$2/);
});

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

test('the Delayed reason column only appears once ETC has passed and the close form reuses it',()=>{
  const etc='2026-09-06 10:00';
  assert.equal(delayedReasonRequired(etc,new Date('2026-09-06T09:59+05:30'),0),false);
  assert.equal(delayedReasonRequired(etc,new Date('2026-09-06T10:00+05:30'),0),true);
  const client=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  assert.match(client,/delayedReasonRequired\(row\.expectedCompletionAt, new Date\(now\), 0\)/);
  assert.match(client,/showDelayedReason = Boolean\(onDelayedReason\) && rows\.some\(delayedReasonDue\)/);
  assert.match(client,/showDelayedReason && workflowHeader\("delayedReason", "Delayed reason"\)/);
  assert.doesNotMatch(client,/name="delayedReason"/);
  assert.match(client,/delayedReason: storedDelayedReason/);
  assert.match(client,/disabled=\{submitting\|\|delayedReasonMissing\}/);
  assert.match(server,/expected_completion_at,delayed_reason FROM maintenance_requests/);
  assert.match(server,/const effectiveDelayedReason=delayedReason\|\|String\(meterRows\[0\]\.delayed_reason\|\|''\)\.trim\(\)/);
  assert.doesNotMatch(server,/delayed_reason='',status/);
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
  assert.match(client,/delayedReasonRequired\(request\.expectedCompletionAt,closingAt\)/);
  assert.match(server,/delayed_reason TEXT NOT NULL DEFAULT ''/);
  assert.match(server,/delayedReasonRequired\(meterRows\[0\]\.expected_completion_at,closedAt\)/);
  assert.match(server,/Select a delayed reason because this request is being closed at least 4 hours after ETC/);
  assert.match(server,/INSERT INTO master_records \(master_name,record_data\)[\s\S]*SELECT 'Delayed Reason'/);
  assert.match(server,/canViewDelayedReasons[\s\S]*permissions\?\.closeRequests===true/);
});
