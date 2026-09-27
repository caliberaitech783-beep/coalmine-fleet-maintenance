import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fleetErpUpdates} from '../fleet-erp-sync.mjs';
import {withFleetDriverNames} from '../fleet-driver-names.mjs';

test('ERP sync updates existing stable assets only and preserves unrelated fields and usable saved values',()=>{
  const rows=[{id:1,record_data:{oracleEquipmentTno:'42',model:'-',currentLocation:'Sasti',status:'Idle'}},{id:2,record_data:{oracleEquipmentTno:'43',model:'Saved model'}}];
  const erp=[{oracleEquipmentTno:'42',model:'4018',make:'TATA'},{oracleEquipmentTno:'43',model:'-'},{oracleEquipmentTno:'99',model:'Unrelated'}];
  const result=fleetErpUpdates(rows,erp,[{oracleEquipmentTno:'42',driverName:'Assigned Driver',driverAt:'2026-09-27 10:00:00'}]);
  assert.equal(result.updates.length,1);
  assert.deepEqual(result.updates[0].record,{...rows[0].record_data,model:'4018',make:'TATA',logbookDriverName:'Assigned Driver',logbookDriverAt:'2026-09-27 10:00:00'});
  assert.equal(result.summary.missingDrivers,1);
  assert.equal(result.summary.missingModels,0);
  assert.equal(rows[0].record_data.model,'-');
});

test('registration-only logbooks match door-prefixed vehicles but never conflicting Oracle IDs',()=>{
  const driver={vehicleNo:'MH34M8290',driverName:'Driver',driverAt:'2026-09-27'};
  const vehicle={oracleEquipmentTno:'42',door:'WT4-MH34M8290'};
  assert.equal(withFleetDriverNames([vehicle],[driver])[0].logbookDriverName,'Driver');
  assert.equal(withFleetDriverNames([vehicle],[{...driver,oracleEquipmentTno:'99'}])[0].logbookDriverName,undefined);
  assert.equal(withFleetDriverNames([vehicle],[driver,{...driver,driverName:'Another'}])[0].logbookDriverName,undefined);
});

test('targeted sync is authenticated, transactional, and never inserts or deletes assets',()=>{
  const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const route=source.slice(source.indexOf("app.post('/api/oracle/fleet-details/sync'"),source.indexOf("app.post('/api/oracle/equipment/sync'"));
  assert.match(route,/requireSuper/);
  assert.match(route,/refresh:true/);
  assert.match(route,/FOR UPDATE/);
  assert.match(route,/'COMMIT'/);
  assert.match(route,/'ROLLBACK'/);
  assert.doesNotMatch(route,/DELETE FROM|INSERT INTO/);
  const oracle=readFileSync(new URL('../oracle-db.mjs',import.meta.url),'utf8');
  assert.match(oracle,/NULLIF\(NULLIF\(TRIM\(equipment.manufacturermodelno\), '-'/);
  assert.match(oracle,/NULLIF\(NULLIF\(TRIM\(equipment.manufacturemodelcode\), '-'/);
});
