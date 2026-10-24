import test from 'node:test';
import assert from 'node:assert/strict';
import {equipmentDoorNumber,equipmentMasterWithDoor,requestsWithDoorNumbers} from '../equipment-door.mjs';
import {requestEquipmentDetails,requestEquipmentCreationDetails} from '../request-equipment.mjs';
import {equipmentMachineLabel} from '../src/dashboard-drilldown-model.mjs';
import {fleetAssetRequestDetails} from '../dashboard-equipment-metrics.mjs';
import {downtimeMatrixRange} from '../src/downtime-matrix.mjs';

const master={door:'V316',reg:'2328930',equipmentName:'VOLVO TIPPER',chassisNo:'CH123',currentLocation:'Mine'};

test('master rows and requests copy the full equipment name over legacy Oracle identifiers',()=>{
  for(const equipmentName of ['S52 - MH34BZ0371','HP6 - 40034','PL63- MH34CD4480','PL69–MP66ZB8422','MH34BZ 5366','CG15EA4047','B14','WT33 - MH34BZ6294','MH34BZ8708 -T-23']) {
    for(const door of ['', '-', 'ORACLE123', 'S52', equipmentName]) {
      const record={equipmentName,door,reg:equipmentName,chassisNo:'CH123'};
      const normalized=equipmentMasterWithDoor(record);
      assert.equal(normalized.door,equipmentName);
      assert.equal(normalized.equipmentName,equipmentName);
      assert.equal(requestEquipmentCreationDetails(record).door,equipmentName);
      assert.deepEqual(equipmentMasterWithDoor(normalized),normalized);
      assert.equal(record.door,door);
    }
  }
});

test('all shared door consumers use the exact Equipment Master field',()=>{
  for (const door of ['V316','00316','2328930','WT22 - MP66ZD0582']) {
    const record={...master,door};
    assert.equal(equipmentDoorNumber(record),door);
    assert.equal(requestEquipmentDetails(record).door,door);
    assert.equal(requestEquipmentCreationDetails(record).door,door);
    assert.equal(equipmentMachineLabel(record),door);
    assert.equal(fleetAssetRequestDetails([record],[])[0].door,door);
  }
});

test('missing master doors never substitute registration, name, or chassis',()=>{
  for (const door of ['', '—', '-', 'N/A']) {
    const record={...master,door};
    assert.equal(equipmentDoorNumber(record),'');
    assert.equal(requestEquipmentCreationDetails(record).door,'');
    assert.equal(equipmentMachineLabel(record),'Not recorded');
    assert.equal(fleetAssetRequestDetails([record],[])[0].door,'');
    assert.equal(requestsWithDoorNumbers([{door:'2328930',chassis:'CH123'}],[record])[0].door,'');
  }
});

test('saved request identifiers resolve to master without rewriting history',()=>{
  const request={door:'2328930',reportDoor:'2328930',chassis:'CH123',site:'Mine'};
  const resolved=requestsWithDoorNumbers([request],[master])[0];
  assert.equal(resolved.door,'V316');
  assert.equal(resolved.reportDoor,'V316');
  assert.equal(request.door,'2328930');
  assert.deepEqual(requestsWithDoorNumbers([resolved],[master])[0],resolved);
  assert.equal(requestsWithDoorNumbers([request],[{...master,door:'V317'}])[0].door,'V317');
});

test('unmatched, conflicting and ambiguous identities show no guessed door',()=>{
  for (const records of [[],[master,{...master,door:'OTHER'}],[{...master,chassisNo:'WRONG'}]]) {
    const [resolved]=requestsWithDoorNumbers([{door:'2328930',chassis:'CH123',reportDoor:'2328930'}],records);
    assert.equal(resolved.door,'');
    assert.equal(resolved.reportDoor,'');
  }
  const [unknown]=requestsWithDoorNumbers([{door:'2328930'}],[]);
  assert.equal(requestsWithDoorNumbers([unknown],[master])[0].door,'V316');
});

test('downtime uses master door and preserves events when door is missing',()=>{
  const event={door:'2328930',chassis:'CH123',site:'Mine',start:'2026-10-14T10:00',closedAt:'2026-10-14T12:00'};
  const run=records=>downtimeMatrixRange([event],records,'2026-10-14T00:00','2026-10-15T00:00',Date.parse('2026-10-16T00:00Z'));
  assert.equal(run([master])[0].door,'V316');
  for (const records of [[],[{...master,door:''}]]) {
    const [row]=run(records);
    assert.equal(row.door,'—');
    assert.equal(row.events.length,1);
    assert.equal(row.downtime,2);
  }
});

test('imported master labels survive repeated API/report resolution and matrix export rows',()=>{
  const start='2026-10-14T10:00',closedAt='2026-10-14T12:00';
  for (const [equipmentName,reg,chassisNo] of [
    ['V316 - 2328930','2328930','CH-V316'],
    ['D23 - 07339','','7339'],
    ['PL69–MP66ZB8422','MP66ZB8422','CH-PL69'],
  ]) {
    for (const door of ['',reg]) {
      const record={door,equipmentName,reg,chassisNo,currentLocation:'Mine'};
      const request={door:reg||chassisNo,chassis:chassisNo,site:'Mine',start,closedAt};
      const [apiRow]=requestsWithDoorNumbers([request],[record]);
      const [reportRow]=requestsWithDoorNumbers([apiRow],[record]);
      assert.equal(apiRow.door,equipmentName);
      assert.equal(reportRow.door,equipmentName);
      const [matrix]=downtimeMatrixRange([reportRow],[record],'2026-10-14T00:00','2026-10-15T00:00',Date.parse('2026-10-16T00:00Z'));
      assert.equal(matrix.door,equipmentName);
      assert.equal(matrix.downtime,2);
      assert.equal(request.door,reg||chassisNo);
    }
  }
  for (const record of [{reg:'2328930'},{chassisNo:'CH123'},{equipmentName:'2328930',reg:'2328930'},{equipmentName:'PC200',model:'PC200'}]) {
    assert.equal(equipmentDoorNumber(record),'');
  }
});
