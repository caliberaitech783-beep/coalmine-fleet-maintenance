import test from 'node:test';
import assert from 'node:assert/strict';
import {withFleetDriverNames} from '../fleet-driver-names.mjs';
import {vehicleFleetRows, vehicleCommonRemarkRows} from '../src/vehicle-repair-history.mjs';

const driver = {oracleEquipmentTno:'42', equipmentName:'E04 - MH34BZ2414', driverName:'Ravi Kumar', driverAt:'2026-09-25 10:00:00'};
test('logbook drivers populate vehicles without breakdown or transfer history', () => {
  const equipment = [{oracleEquipmentTno:'42', equipmentName:driver.equipmentName}];
  const enriched = withFleetDriverNames(equipment, [driver]);
  assert.equal(vehicleFleetRows(enriched)[0].driverName, 'Ravi Kumar');
  assert.equal(vehicleCommonRemarkRows(enriched)[0].driverName, 'Ravi Kumar');
  assert.equal(equipment[0].logbookDriverName, undefined);
});
test('driver joins normalize labels, reject ambiguity and respect stable Oracle identities', () => {
  assert.equal(withFleetDriverNames([{door:'E04-MH34BZ2414'}], [driver])[0].logbookDriverName, driver.driverName);
  const other = {...driver, oracleEquipmentTno:'43', driverName:'Other driver'};
  assert.equal(withFleetDriverNames([{door:driver.equipmentName}], [driver, other])[0].logbookDriverName, undefined);
  assert.equal(withFleetDriverNames([{oracleEquipmentTno:'42', door:driver.equipmentName}], [driver, other])[0].logbookDriverName, driver.driverName);
  assert.equal(withFleetDriverNames([{oracleEquipmentTno:'99', door:driver.equipmentName}], [driver])[0].logbookDriverName, undefined);
});
test('latest recorded name wins and absent Oracle matches preserve saved names', () => {
  const equipment = withFleetDriverNames([{door:driver.equipmentName, oracleEquipmentTno:'42'}], [driver]);
  const request = {door:driver.equipmentName, driverName:'Earlier driver', start:'2026-09-24 10:00'};
  assert.equal(vehicleFleetRows(equipment, [request])[0].driverName, driver.driverName);
  const newer = {...request, start:'2026-09-26 10:00', driverName:'Newer driver'};
  assert.equal(vehicleFleetRows(equipment, [newer])[0].driverName, 'Newer driver');
  assert.equal(vehicleFleetRows(withFleetDriverNames([{door:driver.equipmentName}], []), [request])[0].driverName, 'Earlier driver');
});
