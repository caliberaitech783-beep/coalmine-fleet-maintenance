import test from 'node:test';
import assert from 'node:assert/strict';
import { fleetAssetCounts, liveEquipmentRoadStatus } from '../dashboard-equipment-metrics.mjs';

test('chart off-road counts include active maintenance types, count assets once and exclude idle and stale master status', () => {
  const records = [{door:'A',category:'Equipment'}, {door:'B',category:'Vehicle'}, {door:'C',category:'Vehicle'}, {door:'D',category:'Equipment',status:'Off road'}, {door:'E',category:'Vehicle'}];
  const requests = [{door:'A',status:'Open',category:'Preventive'}, {door:'A',status:'Open',category:'Breakdown'}, {door:'B',status:'Open',category:'Accidental'}, {door:'C',status:'Idle'}, {door:'E',status:'Closed'}];
  assert.deepEqual(fleetAssetCounts(records.filter(record => liveEquipmentRoadStatus(record, requests) === 'offroad')), {equipment:1,vehicles:1,total:2});
  assert.equal(liveEquipmentRoadStatus(records[3], requests), 'onroad');
  assert.equal(records[3].status, 'Off road', 'the live calculation must not alter the stored master snapshot');
});
