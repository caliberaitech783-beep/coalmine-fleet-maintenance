import test from 'node:test';
import assert from 'node:assert/strict';
import {maintenanceMetersRequired,requireMaintenanceMeters} from '../maintenance-meter-required.mjs';

const maintenance={role:'normal',assignedRole:'Maintenance User'};
test('only Maintenance Users require both meters',()=>{
  assert.equal(maintenanceMetersRequired(maintenance),true);
  for(const session of [{role:'super'},{role:'normal',assignedRole:'MIS User'},{role:'normal',assignedRole:'Production User'},{role:'maintenance-manager'},{role:'project-manager'}]){
    assert.equal(maintenanceMetersRequired(session),false);
    assert.doesNotThrow(()=>requireMaintenanceMeters(session,{}, {},['opening','closing']));
  }
});
test('both opening and closing readings required; zero is a valid reading',()=>{
  const payload={openingMeterReadings:{HMR:'0',KMR:'1'},closingMeterReadings:{HMR:'2',KMR:'3'}};
  assert.doesNotThrow(()=>requireMaintenanceMeters(maintenance,{meterType:"KMR"},payload,['opening','closing']));
  for(const stage of ['opening','closing'])for(const type of ['HMR','KMR'])for(const value of ['',null,'bad','-1']){
    const invalid=structuredClone(payload);invalid[stage+'MeterReadings'][type]=value;
    assert.throws(()=>requireMaintenanceMeters(maintenance,{meterType:"KMR"},invalid,['opening','closing']),{status:400});
  }
});
test('existing opening readings are reused at close, but explicit empty values are rejected',()=>{
  const before={meterType:'KMR',openingMeterReadings:{HMR:'10',KMR:'20'}};
  const payload={closingMeterReadings:{HMR:'11',KMR:'21'}};
  assert.doesNotThrow(()=>requireMaintenanceMeters(maintenance,before,payload,['opening','closing']));
  assert.throws(()=>requireMaintenanceMeters(maintenance,before,{...payload,openingMeterReadings:{KMR:''}},['opening','closing']),{status:400});
});

test("equipment accepts HMR alone at opening and closing despite legacy KMR keys",()=>{const before={meterType:"HMR",openingMeterReadings:{HMR:"14330.7",KMR:""}};assert.doesNotThrow(()=>requireMaintenanceMeters(maintenance,before,{meterType:"HMR",closingMeterReadings:{HMR:"14331"}},["opening","closing"]));assert.throws(()=>requireMaintenanceMeters(maintenance,before,{closingMeterReadings:{HMR:""}},["closing"]),{status:400});});
