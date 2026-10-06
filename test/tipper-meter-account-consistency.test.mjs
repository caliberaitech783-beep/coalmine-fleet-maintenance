import assert from 'node:assert/strict';
import test from 'node:test';
import {requestMeterTypesForRequest, requestMeterReadings} from '../request-equipment.mjs';

test('Volvo tipper exposes closing KMR regardless of account master visibility', () => {
  const request = {ref: 'REQ-1791254430195', door: 'V611-96916', chassis: 'YV2XG30G3T899691628', equipmentGroup: 'VOLVO TIPPERS', meterType: 'HMR', openingMeterReading: '5968', closingMeterReadings: {HMR: '5968', KMR: ''}};
  const records = [{door: request.door, chassisNo: request.chassis, category: 'Equipment', group: 'VOLVO TIPPERS'}];
  for (const master of [[], records]) {
    assert.deepEqual(requestMeterTypesForRequest(request, master), ['HMR', 'KMR']);
    assert.deepEqual(requestMeterReadings(request, 'closing', master), {HMR: '5968', KMR: ''});
    assert.deepEqual(requestMeterReadings({...request, closingMeterReadings: {HMR: '5968', KMR: '42000'}}, 'closing', master), {HMR: '5968', KMR: '42000'});
  }
  assert.deepEqual(requestMeterTypesForRequest({door: request.door, meterType: 'HMR'}, records), ['HMR', 'KMR']);
});

test('non-tipper equipment retains HMR only', () => {
  assert.deepEqual(requestMeterTypesForRequest({door: 'EX1', equipmentGroup: 'EXCAVATORS', meterType: 'HMR'}, [{door: 'EX1', category: 'Equipment', group: 'EXCAVATORS'}]), ['HMR']);
});
