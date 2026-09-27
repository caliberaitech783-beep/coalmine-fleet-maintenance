import test from 'node:test';
import assert from 'node:assert/strict';
import {equipmentDoorNumber,requestsWithDoorNumbers} from '../equipment-door.mjs';
import {requestEquipmentDetails} from '../request-equipment.mjs';
import {equipmentMachineLabel} from '../src/dashboard-drilldown-model.mjs';
import {fleetAssetRequestDetails} from '../dashboard-equipment-metrics.mjs';
import {readFileSync} from 'node:fs';

const tanker={door:'',reg:'MP66ZD0582',equipmentName:'WT22 - MP66ZD0582',chassisNo:'MAT569006P3J27912',site:'Jayant OB'};
const tipper={door:'',reg:'2328929',equipmentName:'V316 - 2328929',chassisNo:'YV2XBZ0G9R8986479L26'};

test('vacant doors automatically use registration across requests and fleet displays',()=>{
  const vehicle={door:'—',reg:'UP64AT9857',equipmentName:'UP64AT9857',chassisNo:'CH123'};
  assert.equal(equipmentDoorNumber(vehicle),'UP64AT9857');
  assert.equal(requestEquipmentDetails(vehicle).door,'UP64AT9857');
  assert.equal(equipmentMachineLabel(vehicle),'UP64AT9857');
  const [row]=fleetAssetRequestDetails([vehicle],[]);
  assert.equal(row.door,'UP64AT9857');
  const request={door:'',reg:'UP64AT9857',reportDoor:''};
  assert.deepEqual(requestsWithDoorNumbers([request],[])[0],{...request,door:'UP64AT9857',reportDoor:'UP64AT9857'});
  assert.equal(request.door,'');
  assert.equal(equipmentDoorNumber({...vehicle,door:'WT22'}),'WT22');
  assert.equal(equipmentDoorNumber({registration:'MH34BZ5366'}),'MH34BZ5366');
  assert.equal(equipmentDoorNumber({reg:'-',registrationNumber:'CG15EA4047'}),'CG15EA4047');
  assert.equal(equipmentDoorNumber({door:'-',reg:'—',chassisNo:'CH123'}),'');
});
test('BD sheet, fleet drilldowns and printable table use the master door label',()=>{
  for(const record of [tanker,tipper]){
    assert.equal(equipmentMachineLabel(record),record.equipmentName);
    assert.equal(equipmentMachineLabel({...record,door:record.reg}),record.equipmentName);
    const [row]=fleetAssetRequestDetails([record],[]);
    assert.equal(row.door,record.equipmentName);
    assert.equal(equipmentMachineLabel(row),record.equipmentName);
  }
  const ui=readFileSync(new URL('../src/dashboard-record-browser.jsx',import.meta.url),'utf8');
  assert.match(ui,/equipmentMachineLabel\(record\)/);
  const dashboard=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.ok(dashboard.includes('door: requestEquipmentDetails(equipment || {}).door || request.door'));
});
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
  assert.equal(equipmentDoorNumber({reg:'ABC123',chassisNo:'CH123',equipmentName:'Excavator'}),'ABC123');
  assert.equal(equipmentDoorNumber({equipmentName:'PC200',model:'PC200'}),'');
  assert.equal(equipmentDoorNumber({reg:'ABC123',equipmentName:'ABC123'}),'ABC123');
  assert.equal(requestsWithDoorNumbers([request],[])[0],request);
  assert.equal(requestsWithDoorNumbers([request],[{door:'OTHER',chassisNo:tanker.reg}])[0],request);
  const wrongSite={...request,site:'Sasti OB'};
  assert.equal(requestsWithDoorNumbers([wrongSite],[{...tanker,currentLocation:'Jayant OB'}])[0],wrongSite);
});
