import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {DELAYED_REASON_DEFAULTS,DELAYED_REASON_DEFAULT_REPAIR_TYPES,DELAYED_REASONS_BY_REPAIR_TYPE,delayedReasonRequired,delayedReasonsForRepairType} from '../delayed-reason.mjs';

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

test('delayed reasons are offered per breakdown type in the approved order',()=>{
  const common=['Parts - OEM','Parts - CMLL','Tools NA - OEM','Tools NA - CMLL','Repair in progress - OEM','Repair in progress - CMLL','Approval - OEM','Approval - CMLL'];
  assert.deepEqual(DELAYED_REASONS_BY_REPAIR_TYPE.ACCIDENTAL,[...common,'Acc- Insurance Survey-OEM','Acc- Insurance Survey-CMLL','Acc- Insurance Approval-CMLL','Acc- Insurance Approval-OEM','Acc- Repair Estimate-CMLL','Acc- Repair Estimate-OEM','Manpower shortage - OEM','Manpower shortage - CMLL']);
  assert.deepEqual(DELAYED_REASONS_BY_REPAIR_TYPE.SUPERSTRUCTURE,[...common,'Fault Diagnosis - OEM','Superstructure - Parts','Superstructure - Manpower','Superstructure - Repair','Manpower shortage - OEM','Manpower shortage - CMLL']);
  assert.deepEqual(DELAYED_REASONS_BY_REPAIR_TYPE.GENERAL,[...common,'Fault Diagnosis - OEM','Manpower shortage - OEM','Manpower shortage - CMLL']);
  assert.deepEqual(delayedReasonsForRepairType('Accidental'),DELAYED_REASONS_BY_REPAIR_TYPE.ACCIDENTAL);
  assert.deepEqual(delayedReasonsForRepairType('Super Structure'),DELAYED_REASONS_BY_REPAIR_TYPE.SUPERSTRUCTURE);
  assert.deepEqual(delayedReasonsForRepairType('superstructure'),DELAYED_REASONS_BY_REPAIR_TYPE.SUPERSTRUCTURE);
  for(const type of ['WGM','Preventive','Breakdown','Aggregate Repair','',undefined])assert.deepEqual(delayedReasonsForRepairType(type),DELAYED_REASONS_BY_REPAIR_TYPE.GENERAL,type);
  // Reasons removed from the master disappear; custom master reasons stay available for every type.
  const master=['Parts - CMLL','Fault Diagnosis - OEM','Superstructure - Repair','Crane booked','Acc- Repair Estimate-OEM'];
  assert.deepEqual(delayedReasonsForRepairType('Breakdown',master),['Parts - CMLL','Fault Diagnosis - OEM','Crane booked']);
  assert.deepEqual(delayedReasonsForRepairType('Accidental',master),['Parts - CMLL','Acc- Repair Estimate-OEM','Crane booked']);
  assert.deepEqual(delayedReasonsForRepairType('Super Structure',master),['Parts - CMLL','Fault Diagnosis - OEM','Superstructure - Repair','Crane booked']);
  const client=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.match(client,/delayedReasonsForRepairType\(request\.category, records\)/);
  assert.match(client,/\{key: "category", label: "Breakdown type", value: \(row\) => row\.category\}/);
  assert.match(client,/\["category", "Breakdown type"\], \["delayedReason", "Delayed reason"\]/);
  assert.match(client,/case "delayedReason": return <td>\{r\.delayedReason \|\| "—"\}<\/td>;/);
});

test('breakdown types stored in the Delayed Reason master drive the picker and the ETC delay flow',()=>{
  assert.equal(DELAYED_REASON_DEFAULT_REPAIR_TYPES['Parts - OEM'],'All');
  assert.equal(DELAYED_REASON_DEFAULT_REPAIR_TYPES['Manpower shortage - CMLL'],'All');
  assert.equal(DELAYED_REASON_DEFAULT_REPAIR_TYPES['Acc- Insurance Survey-OEM'],'Accidental');
  assert.equal(DELAYED_REASON_DEFAULT_REPAIR_TYPES['Superstructure - Repair'],'Super Structure');
  assert.equal(DELAYED_REASON_DEFAULT_REPAIR_TYPES['Fault Diagnosis - OEM'],'Super Structure, Breakdown, Preventive, Aggregate Repair, WGM');
  // Seeded master records reproduce the approved lists exactly, in order.
  const seeded=DELAYED_REASON_DEFAULTS.map((delayedReason)=>({delayedReason,repairTypes:DELAYED_REASON_DEFAULT_REPAIR_TYPES[delayedReason]}));
  assert.deepEqual(delayedReasonsForRepairType('Accidental',seeded),DELAYED_REASONS_BY_REPAIR_TYPE.ACCIDENTAL);
  assert.deepEqual(delayedReasonsForRepairType('Super Structure',seeded),DELAYED_REASONS_BY_REPAIR_TYPE.SUPERSTRUCTURE);
  for(const type of ['WGM','Preventive','Breakdown','Aggregate Repair'])assert.deepEqual(delayedReasonsForRepairType(type,seeded),DELAYED_REASONS_BY_REPAIR_TYPE.GENERAL,type);
  // Admin edits win over the approved lists.
  const edited=[{delayedReason:'Parts - OEM',repairTypes:'WGM'},{delayedReason:'Crane booked',repairTypes:'accidental; wgm'},{delayedReason:'Weather',repairTypes:'All'},{delayedReason:'Tyre stock',repairTypes:''}];
  assert.deepEqual(delayedReasonsForRepairType('WGM',edited),['Parts - OEM','Crane booked','Weather','Tyre stock']);
  assert.deepEqual(delayedReasonsForRepairType('Breakdown',edited),['Weather','Tyre stock']);
  assert.deepEqual(delayedReasonsForRepairType('Accidental',edited),['Crane booked','Weather','Tyre stock']);
  const client=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  assert.match(client,/\["repairTypes", "Breakdown types \(comma separated, or All\)"\]/);
  assert.match(client,/const etcDelayed = etcChanged && expectedCompletionAt\.slice\(0,16\) > initialEtc;/);
  assert.match(client,/etcDelayed && <label className="full">Delayed reason \*<select name="delayedReason" required/);
  assert.match(client,/delayedReasonsForRepairType\(editCategory, delayedReasonRecords \|\| \[\]\)/);
  assert.match(server,/delayed_reason_repair_types_seeded_v1/);
  assert.match(server,/delayed_reason=CASE WHEN \$12<>'' THEN \$12 ELSE delayed_reason END/);
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

test('a delayed reason applies as soon as the current time passes ETC, with no grace period',()=>{
  const etc='2026-09-06 10:00';
  assert.equal(delayedReasonRequired(etc,'2026-09-06 09:59'),false);
  assert.equal(delayedReasonRequired(etc,'2026-09-06 10:00'),true);
  assert.equal(delayedReasonRequired(etc,'2026-09-06 13:59'),true);
  assert.equal(delayedReasonRequired('',new Date()),false);
});

test('the Delayed reason column only appears once ETC has passed and the close form reuses it',()=>{
  const etc='2026-09-06 10:00';
  assert.equal(delayedReasonRequired(etc,new Date('2026-09-06T09:59+05:30'),0),false);
  assert.equal(delayedReasonRequired(etc,new Date('2026-09-06T10:00+05:30'),0),true);
  const client=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  assert.match(client,/delayedReasonRequired\(row\.expectedCompletionAt, new Date\(now\), 0\)/);
  assert.match(client,/canSelectDelayedReason = \(row\) => Boolean\(onDelayedReason\) && delayedReasonDue\(row\)/);
  assert.match(client,/\{workflowHeader\("delayedReason", "Delayed reason"\)\}/);
  assert.doesNotMatch(client.slice(client.indexOf('function CloseRequestForm'),client.indexOf('function VerifyRequestForm')),/name="delayedReason"/);
  assert.doesNotMatch(client,/delayedReasonNeeded/);
  assert.match(client,/delayedReason: storedDelayedReason/);
  assert.doesNotMatch(server,/Select a delayed reason because/);
  assert.match(server,/expected_completion_at,delayed_reason FROM maintenance_requests/);
  assert.match(server,/const effectiveDelayedReason=delayedReason\|\|String\(meterRows\[0\]\.delayed_reason\|\|''\)\.trim\(\)/);
  assert.doesNotMatch(server,/delayed_reason='',status/);
});

test('Delayed Reason master, close form, and server validation are connected',()=>{
  const client=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const access=fs.readFileSync(new URL('../admin-access.mjs',import.meta.url),'utf8');
  assert.match(access,/"Region master",\s*"Shift Master",\s*"Delayed Reason",\s*"Vehicle transfers"/);
  assert.match(client,/\["Region master", Building2\],\s*\["Shift Master", Clock\],\s*\["Delayed Reason", Clock\],\s*\["Vehicle transfers", ArrowRightLeft\]/);
  assert.match(client,/useMasterRecords\("Delayed Reason"\)/);
  assert.match(client,/masterAccessAllows\(viewPermissions, name\)/);
  assert.match(server,/masterAccessAllows\(session\.permissions,requestedMaster\)/);
  assert.match(server,/delayed_reason TEXT NOT NULL DEFAULT ''/);
  assert.match(server,/delayedReasonRequired\(meterRows\[0\]\.expected_completion_at,closedAt\)/);
  assert.match(server,/INSERT INTO master_records \(master_name,record_data\)[\s\S]*SELECT 'Delayed Reason'/);
  assert.match(server,/canViewDelayedReasons[\s\S]*permissions\?\.closeRequests===true/);
});
