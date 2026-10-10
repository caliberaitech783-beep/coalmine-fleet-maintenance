import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from 'node:fs';
import {isIdleVehicleRequest} from '../request-idle.mjs';
import {
  activeRequestConflictMessage,
  findActiveRequestConflict,
  isActiveMaintenanceRequest,
} from "../request-conflict.mjs";

test('closed pending idle blocks by door or chassis and takes priority over active linked cases', () => {
  const idle={ref:'REQ-IDLE',door:'E94',chassis:'CH94',status:'Closed',closedAt:'2026-10-09',vehicleIdle:true};
  const active={...idle,ref:'REQ-ACTIVE',status:'Accepted',closedAt:null,vehicleIdle:false};
  assert.equal(findActiveRequestConflict([active,idle],{door:' e94 '}),idle);
  assert.equal(findActiveRequestConflict([idle],{chassis:'ch94'}),idle);
  assert.match(activeRequestConflictMessage(idle),/Resolve the idle approval/);
  assert.equal(findActiveRequestConflict([{...idle,vehicleIdle:false,idealApprovedAt:'2026-10-10'}],{door:'E94'}),null);
  assert.equal(findActiveRequestConflict([idle],{door:'E95'}),null);
});

test('transaction guard rejects pending idle even with linked-ticket override, before writing', async () => {
  const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const code=source.slice(source.indexOf('async function createRequestWithVehicleLock('),source.indexOf("app.get('/api/requests/conflict'"));
  for(const existingReason of ['','same','different']){
    const queries=[];
    const client={query:async sql=>queries.push(sql),release:()=>{}};
    const create=new Function('pool','activeRequestConflict','isIdleVehicleRequest','activeRequestConflictMessage',`${code};return createRequestWithVehicleLock;`)(
      {connect:async()=>client},async()=>({ref:'REQ-IDLE',door:'E94',status:'Closed',vehicleIdle:true}),isIdleVehicleRequest,activeRequestConflictMessage);
    let wrote=false;
    await assert.rejects(create({door:'E94',existingReference:'REQ-IDLE',existingReason},async()=>{wrote=true;}),error=>error.status===409&&error.idleApprovalPending);
    assert.equal(wrote,false);
    assert.ok(queries.includes('ROLLBACK'));
  }
});

test("active requests conflict on a normalized door number", () => {
  const request = {ref: "REQ-100", door: "  MH-40 ", chassis: "CH-1", status: "Open"};

  assert.equal(findActiveRequestConflict([request], {door: "mh-40"}), request);
});

test("closed requests do not prevent a new request", () => {
  const closed = {ref: "REQ-101", door: "D-12", chassis: "CH-2", status: "Closed"};

  assert.equal(isActiveMaintenanceRequest(closed), false);
  assert.equal(findActiveRequestConflict([closed], {door: "D-12", chassis: "CH-2"}), null);
});

test("closure evidence outranks stale or inconsistently formatted status text", () => {
  for (const request of [
    {ref: "REQ-CLOSED-CASE", door: "D-12", status: " closed "},
    {ref: "REQ-CLOSED-AT", door: "D-12", status: "Open", closedAt: "2026-09-10 12:00:00"},
    {ref: "REQ-VERIFIED", door: "D-12", status: "Open", verifiedAt: "2026-09-10 12:30:00"},
  ]) {
    assert.equal(isActiveMaintenanceRequest(request), false, request.ref);
    assert.equal(findActiveRequestConflict([request], {door: "D-12"}), null, request.ref);
  }
});

test("chassis matching protects the same asset when a door value differs", () => {
  const request = {ref: "REQ-102", door: "OLD-7", chassis: "CHASSIS-7", status: "Idle"};

  assert.equal(findActiveRequestConflict([request], {door: "NEW-7", chassis: " chassis-7 "}), request);
});

test("conflict message identifies the door and active request", () => {
  assert.equal(
    activeRequestConflictMessage({ref: "REQ-103", door: "D-22"}),
    "Door D-22 is already off road / under maintenance under request REQ-103. A second request cannot be created until the active request is closed.",
  );
});
