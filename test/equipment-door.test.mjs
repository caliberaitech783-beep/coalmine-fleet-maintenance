import test from 'node:test';
import assert from 'node:assert/strict';
import {equipmentDoorNumber,requestsWithDoorNumbers} from '../equipment-door.mjs';
import {requestEquipmentDetails} from '../request-equipment.mjs';

const tanker={door:'',reg:'MP66ZD0582',equipmentName:'WT22 - MP66ZD0582',chassisNo:'MAT569006P3J27912',site:'Jayant OB'};
const tipper={door:'',reg:'2328929',equipmentName:'V316 - 2328929',chassisNo:'YV2XBZ0G9R8986479L26'};
test('imported fleet labels take priority over registration for new requests',()=>{
  for(const record of [tanker,tipper]){
    assert.equal(equipmentDoorNumber(record),record.equipmentName);
    assert.equal(requestEquipmentDetails(record).door,record.equipmentName);
  }
  assert.equal(equipmentDoorNumber({...tanker,door:'WT22'}),'WT22');
  assert.equal(equipmentDoorNumber({...tanker,door:tanker.reg}),tanker.equipmentName);
});
test('existing requests and report doors resolve without modifying saved history',()=>{
  const original={ref:'REQ-1',door:tanker.reg,reportDoor:tanker.reg,chassis:tanker.chassisNo,status:'Closed',closedAt:'2026-09-23T12:00:00Z'};
  const [resolved]=requestsWithDoorNumbers([original],[tanker]);
  assert.deepEqual(resolved,{...original,door:tanker.equipmentName,reportDoor:tanker.equipmentName});
  assert.equal(original.door,tanker.reg);
  assert.equal(tanker.door,'');
  assert.equal(requestsWithDoorNumbers([{door:'mp66 zd0582'}],[tanker])[0].door,tanker.equipmentName);
  assert.equal(requestsWithDoorNumbers([{door:tipper.reg}],[tipper])[0].door,tipper.equipmentName);
});
test('missing or ambiguous fleet identity never guesses a door number',()=>{
  const request={door:tanker.reg};
  assert.equal(requestsWithDoorNumbers([request],[tanker,{...tanker,equipmentName:'WT99'}])[0],request);
  const conflicting={...request,chassis:'ANOTHER-CHASSIS'};
  assert.equal(requestsWithDoorNumbers([conflicting],[tanker])[0],conflicting);
  assert.equal(equipmentDoorNumber({reg:'ABC123',chassisNo:'CH123',equipmentName:'Excavator'}),'');
  assert.equal(equipmentDoorNumber({equipmentName:'PC200',model:'PC200'}),'');
  assert.equal(equipmentDoorNumber({reg:'ABC123',equipmentName:'ABC123'}),'');
  assert.equal(requestsWithDoorNumbers([request],[])[0],request);
  assert.equal(requestsWithDoorNumbers([request],[{door:'OTHER',chassisNo:tanker.reg}])[0],request);
  const wrongSite={...request,site:'Sasti OB'};
  assert.equal(requestsWithDoorNumbers([wrongSite],[{...tanker,currentLocation:'Jayant OB'}])[0],wrongSite);
});
