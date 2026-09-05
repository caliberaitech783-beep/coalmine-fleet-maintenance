import test from 'node:test';
import assert from 'node:assert/strict';
import { fleetAssetCounts, liveEquipmentRoadStatus } from '../dashboard-equipment-metrics.mjs';

test('chart off-road counts include all maintenance types, count assets once and exclude idle', () => {
  const records = [{door:'A',category:'Equipment'}, {door:'B',category:'Vehicle'}, {door:'C',category:'Vehicle'}, {door:'D',category:'Equipment',status:'Off road'}, {door:'E',category:'Vehicle'}];
  const requests = [{door:'A',status:'Open',category:'Preventive'}, {door:'A',status:'Open',category:'Breakdown'}, {door:'B',status:'Open',category:'Accidental'}, {door:'C',status:'Idle'}, {door:'E',status:'Closed'}];
  assert.deepEqual(fleetAssetCounts(records.filter(record => liveEquipmentRoadStatus(record, requests) === 'offroad')), {equipment:2,vehicles:1,total:3});
});
