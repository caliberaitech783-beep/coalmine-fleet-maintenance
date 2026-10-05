import assert from 'node:assert/strict';
import test from 'node:test';
import {requestMayBeChanged,requestMayBeVerified,REQUEST_CLOSE_STATUSES} from '../request-workflow.mjs';
import {findActiveRequestConflict} from '../request-conflict.mjs';
import {liveEquipmentRoadStatus} from '../dashboard-equipment-metrics.mjs';
import {matchesBreakdownMovement} from '../dashboard-breakdown-movement.mjs';
import {visibleInMisRequests} from '../src/mis-history.mjs';
import {requestStatusLabel} from '../src/request-status.mjs';
test('Running BD stays active after MIS verification and remains maintainable',()=>{
 const row={ref:'REQ-existing',door:'D1',status:'Running BD',verifiedAt:'2026-10-05 12:00'};
 assert.ok(REQUEST_CLOSE_STATUSES.includes(row.status));
 assert.equal(requestMayBeChanged(row),true);
 assert.equal(findActiveRequestConflict([row],{door:'D1'}),row);
 assert.equal(requestMayBeVerified(row),false);
 assert.equal(requestMayBeVerified({...row,verifiedAt:null}),true);
 assert.equal(liveEquipmentRoadStatus({door:'D1',status:'Off road'},[row]),'onroad');
 assert.equal(liveEquipmentRoadStatus({door:'D1'},[{...row,status:'In progress'}]),'offroad');
});
test('Running BD KPI and MIS queue include the open ticket',()=>{
 const row={status:'Running BD',runningBdAt:'2026-10-05 12:00',start:'2026-10-01 10:00'};
 assert.equal(matchesBreakdownMovement(row,'2026-10-05','2026-10-05','runningbd'),true);
 assert.equal(visibleInMisRequests(row),true);
 assert.equal(visibleInMisRequests({...row,verifiedAt:'2026-10-05 13:00'}),false);
 assert.equal(requestStatusLabel({...row,verifiedAt:'2026-10-05 13:00'}),'Running BD');
});

import {resolveRequestIssues,hasOutstandingRequestIssues} from '../request-workflow.mjs';
test('closure remains blocked until all accumulated reasons are resolved',()=>{
 const request={issues:[{reason:'Parts unavailable',resolved:false},{reason:'New hydraulic leak',resolved:false}]};
 const partial=resolveRequestIssues(request,[0]);
 assert.equal(hasOutstandingRequestIssues(partial),true);
 assert.equal(hasOutstandingRequestIssues(resolveRequestIssues({issues:partial},[1])),false);
 assert.equal(hasOutstandingRequestIssues(resolveRequestIssues(request,'invalid')),true);
 assert.equal(request.issues[0].resolved,false);
});

import {dashboardFleetSnapshot} from '../dashboard-fleet-snapshot.mjs';
test('production fleet snapshot treats Running BD as available while preserving its open issue',()=>{
 const fleet=[{door:'D1',site:'Sasti OB',category:'Equipment'}];
 const requests=[{door:'D1',site:'Sasti OB',status:'Running BD',verifiedAt:'2026-10-05 13:00'}];
 assert.equal(dashboardFleetSnapshot(fleet,requests)[0].dashboardRoadStatus,'onroad');
 assert.equal(findActiveRequestConflict(requests,{door:'D1'}),requests[0]);
});

import {requestWriteOutcomeConfirmed} from '../src/request-write-recovery.mjs';
test('connection recovery confirms a new Running BD handoff without replaying the write',()=>{
 const before={ref:'REQ-1',status:'In progress'};
 const after={...before,status:'Running BD',runningBdAt:'2026-10-05 13:00'};
 assert.equal(requestWriteOutcomeConfirmed(before,after,'close',{status:'Running BD'}),true);
 assert.equal(requestWriteOutcomeConfirmed(after,after,'close',{status:'Running BD'}),false);
});
