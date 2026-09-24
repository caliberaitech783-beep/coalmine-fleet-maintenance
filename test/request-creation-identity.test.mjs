import test from 'node:test';
import assert from 'node:assert/strict';
import {requestEquipmentCreationDetails, requestEquipmentDetails} from '../request-equipment.mjs';
import {findActiveRequestConflict} from '../request-conflict.mjs';
import {submitMaintenanceRequest} from '../request-submit.mjs';

test('selected equipment with no report door retains its master identity through submission', async () => {
  for (const record of [
    {equipmentName:'Dozer', model:'D85ESS-2', door:'CH-101', chassisNo:'CH-101'},
    {equipmentName:'REG-101', reg:'REG-101', chassisNo:'CH-101'},
    {equipmentName:'D85ESS-2', model:'D85ESS-2', chassisNo:'CH-101'},
  ]) {
    assert.equal(requestEquipmentDetails(record).door, '');
    const details = requestEquipmentCreationDetails(record);
    assert.ok(details.door);
    const payload = {ref:'REQ-1', ...details, complaint:'Track shoe reinforcement work'};
    const sent = await submitMaintenanceRequest(async value => JSON.parse(JSON.stringify(value)), payload);
    assert.ok(sent.ref && sent.door && sent.complaint);
    assert.equal(sent.chassis, 'CH-101');
    const existing = {ref:'REQ-OLD', door:'OLD-LABEL', chassis:'CH-101', status:'Open'};
    assert.equal(findActiveRequestConflict([existing], sent), existing);
  }
});

test('creation prefers a verified fleet label and never invents an identifier from a model', () => {
  assert.equal(requestEquipmentCreationDetails({door:'D-17', reg:'REG-101', chassisNo:'CH-101'}).door, 'D-17');
  assert.equal(requestEquipmentCreationDetails({equipmentName:'WT22 - REG101',reg:'REG101',chassisNo:'CH-101'}).door, 'WT22 - REG101');
  assert.equal(requestEquipmentCreationDetails({equipmentName:'D85ESS-2',model:'D85ESS-2'}).door, '');
});
