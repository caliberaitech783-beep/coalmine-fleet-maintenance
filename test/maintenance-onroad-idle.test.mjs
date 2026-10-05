import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {isIdleVehicleRequest} from '../request-idle.mjs';
import {liveEquipmentRoadStatus,liveEquipmentRoadStatuses} from '../dashboard-equipment-metrics.mjs';
import {matchesBreakdownMovement} from '../dashboard-breakdown-movement.mjs';
import {availabilityRequestsForDate} from '../src/dashboard-availability.mjs';
import {visibleInMaintenanceHistory} from '../src/maintenance-history.mjs';
import {requestStatusLabel} from '../src/request-status.mjs';
import {requestDeletable} from '../request-deletion.mjs';
import {dashboardFleetSnapshot} from '../dashboard-fleet-snapshot.mjs';
import {buildDailyBdBalance} from '../src/daily-bd-balance.mjs';
import {requestWriteOutcomeConfirmed} from '../src/request-write-recovery.mjs';

const idle={ref:'CLOSED-IDLE',status:'Closed',vehicleIdle:true,door:'V1',site:'Sasti OC',start:'2026-09-26 08:00:00',acceptedAt:'2026-09-26 08:10:00',closedAt:'2026-09-27 10:00:00',idealRequestedAt:'2026-09-27 10:01:00',idleReason:'No driver'};
const asset={door:'V1',site:'Sasti OC',currentLocation:'Sasti OC',category:'Vehicle'};

test('a completed repair is Closed in maintenance but its vehicle remains Idle',()=>{
  assert.equal(visibleInMaintenanceHistory(idle),true);
  assert.equal(requestStatusLabel(idle),'Closed');
  assert.equal(isIdleVehicleRequest(idle),true);
  assert.equal(liveEquipmentRoadStatus(asset,[idle]),'idle');
  assert.deepEqual(liveEquipmentRoadStatuses([asset],[idle]),['idle']);
  assert.equal(dashboardFleetSnapshot([asset],[idle])[0].dashboardRoadStatus,'idle');
  assert.equal(requestDeletable(idle),false);
  assert.equal(requestDeletable(idle,{administrator:true}),true);
});

test('completed idle cases count as outgoing and idle, never active BD balance',()=>{
  assert.equal(matchesBreakdownMovement(idle,'2026-09-27','2026-09-27','outgoing'),true);
  assert.equal(matchesBreakdownMovement(idle,'2026-09-27','2026-09-27','idle'),true);
  assert.equal(matchesBreakdownMovement(idle,'2026-09-27','2026-09-27','active-balance'),false);
  const {totals}=buildDailyBdBalance([idle],'2026-09-27','2026-09-27',true);
  assert.equal(totals.balance,0);
  assert.equal(totals.idle,1);
  assert.equal(totals.outgoing,1);
});

test('historical availability retains the idle interval after maintenance closure',()=>{
  const released={...idle,vehicleIdle:false,idealApprovedAt:'2026-09-29 10:00:00'};
  assert.equal(availabilityRequestsForDate([released],'2026-09-28')[0].status,'Idle');
  assert.deepEqual(availabilityRequestsForDate([released],'2026-09-29'),[]);
  assert.equal(liveEquipmentRoadStatus(asset,[released]),'onroad');
  assert.equal(released.closedAt,idle.closedAt);
  assert.equal(requestWriteOutcomeConfirmed(idle,idle,'ideal-onroad'),false);
  assert.equal(requestWriteOutcomeConfirmed(idle,idle,'idle-cancel'),false);
  assert.equal(requestWriteOutcomeConfirmed(idle,released,'ideal-onroad'),true);
});

test('missing old idle timestamps do not prevent vehicle visibility or invent a TAT',()=>{
  assert.equal(isIdleVehicleRequest({...idle,closedAt:null,idealRequestedAt:null}),true);
  assert.equal(isIdleVehicleRequest({...idle,vehicleIdle:false,idealApprovedAt:'2026-09-28 10:00:00'}),false);
});

test('closure records maintenance time and migration backs up previous fields without using migration time',()=>{
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  assert.match(server,/SET closed_at=\$7,closed_by=\$4[^\n]*status='Closed'/);
  assert.match(server,/idle_maintenance_closed_v1_backup/);
  assert.match(server,/closed_at=CASE WHEN ideal_requested_at>=GREATEST\(started_at,accepted_at\)/);
  assert.match(server,/closed_at=CASE WHEN status='Closed' THEN closed_at ELSE COALESCE\(ideal_requested_at,NOW\(\)\) END/);
  const ui=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const form=ui.slice(ui.indexOf('function CloseRequestForm('),ui.indexOf('function VerifyRequestForm('));
  assert.match(form,/if \(!idleDecision.current && status === "Closed"\)/);
  assert.match(form,/setIdlePrompt\(true\)/);
  assert.match(form,/On road — move vehicle to Idle\?/);
  assert.match(form,/Close request and mark vehicle Idle/);
});
