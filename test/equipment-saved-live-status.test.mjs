import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {equipmentRoadStatus,liveEquipmentRoadStatus} from '../dashboard-equipment-metrics.mjs';

const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const component=source.slice(source.indexOf('function Equipment({'),source.indexOf('function Breakdown('));
const start=component.indexOf('  const roadStatusFor');
const end=component.indexOf('    filterText =',start);
function values(record,requests) {
  const setup=component.slice(start,end).replace(/,\s*$/,';');
  return new Function('statusRequests','liveEquipmentRoadStatus','equipmentRoadStatus',`${setup}\nreturn equipmentValue;`)(requests,liveEquipmentRoadStatus,equipmentRoadStatus);
}

test('saved on-road status remains visible while active breakdown still controls live status',()=>{
  const record={door:'D80-08128',status:'Operational'};
  const requests=[{door:record.door,status:'Accepted'}];
  const value=values(record,requests);
  assert.equal(value(record,'status'),'On road');
  assert.equal(value(record,'liveStatus'),'Off road');
  requests[0].status='Closed';
  assert.equal(value(record,'liveStatus'),'On road');
});

test('saved status aliases and unset values are consistently labelled',()=>{
  const value=values({},[]);
  for(const status of ['onroad','On road','Operational']) assert.equal(value({status},'status'),'On road');
  assert.equal(value({status:'Off road'},'status'),'Off road');
  assert.equal(value({status:'Idle'},'status'),'Idle');
  assert.equal(value({},'status'),'Status not set');
});

test('table, column filters and edit form distinguish saved and live statuses',()=>{
  assert.match(component,/\["status", "Equipment status \(saved\)"\], \["liveStatus", "Live fleet status"\]/);
  assert.match(component,/value: \(record\) => equipmentValue\(record, key\)/);
  assert.match(component,/<Status>\{equipmentValue\(v, "status"\)\}<\/Status>/);
  assert.match(component,/<Status>\{equipmentValue\(v, "liveStatus"\)\}<\/Status>/);
  assert.match(component,/Saving On road does not close an active breakdown/);
  assert.match(component,/\[equipmentRoadStatus\(editing\)\]/);
});
