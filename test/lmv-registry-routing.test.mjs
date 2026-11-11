import test from 'node:test';
import assert from 'node:assert/strict';
import {lmvRegistryRecords} from '../fleet-registry.mjs';
import {dashboardFleetSnapshot} from '../dashboard-fleet-snapshot.mjs';
import {lmvFleetSnapshot,lmvCounts,lmvRowsForMode} from '../lmv-fleet.mjs';
import {fleetAssetRequestDetails} from '../dashboard-equipment-metrics.mjs';

test('LMV requests count and report only in LMV even when equipment identifiers overlap',()=>{
  const asset={id:1,door:'J8',chassisNo:'CH8',currentLocation:'Jayant OC',group:'CAR'};
  const request={ref:'REQ-LMV',equipmentGroup:'LMV',door:'J8',chassis:'CH8',site:'Jayant OC',status:'Open',oemResponsibility:'OEM'};
  const records=lmvRegistryRecords([asset],[{...asset,id:2,group:'LMV'},{id:3,door:'J9',group:'LMV',currentLocation:'Jayant OC'}]);
  assert.equal(records.length,2);
  const snapshot=lmvFleetSnapshot(records,[request]);
  assert.equal(lmvCounts(snapshot).breakdown,1);
  assert.equal(lmvCounts(snapshot).oem,1);
  assert.equal(lmvRowsForMode(snapshot,'breakdown')[0].door,'J8');
  assert.equal(fleetAssetRequestDetails(snapshot,[request])[0].requestReference,'REQ-LMV');
  const equipment=dashboardFleetSnapshot([{...asset,fleetSource:'Equipment master'}],[request]);
  assert.equal(equipment[0].dashboardRoadStatus,'onroad');
  assert.equal(fleetAssetRequestDetails(equipment,[request])[0].requestReference,'');
  assert.equal(lmvCounts(lmvFleetSnapshot(records,[{...request,status:'Closed'}])).breakdown,0);
});
