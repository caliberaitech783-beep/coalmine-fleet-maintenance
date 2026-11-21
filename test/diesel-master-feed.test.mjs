import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import { createErpDriverReader, dieselMasterFeed } from '../diesel-master-feed.mjs';
import { registerDieselSharedSignIn } from '../diesel-shared-signin.mjs';
import { protectDeletionPool } from '../deletion-approval.mjs';
import { CDIR_MASTERS } from '../cdir-masters.mjs';
import { createHash } from 'node:crypto';

const rows = [
  { id: 1, master_name: 'Region master', record_data: { name: 'Western Coalfields Limited', code: 'WCL', state: 'MH / MP', sites: 'Sasti OB | Majri OC' } },
  { id: 2, master_name: 'Equipment master', record_data: { door: 'T-101', reg: 'MH34AB1234', currentLocation: 'sasti ob', make: 'Volvo', model: 'FMX 500', status: 'Active' } },
  { id: 3, master_name: CDIR_MASTERS.employee, record_data: { name: 'Ravi Kumar', empId: 'E001', site: 'Sasti OC', designation: 'TIPPER DRIVER', department: 'Production', status: 'ACTIVE', dob: '1990-01-01', uan: '100200300400', aadharMasked: 'XXXX1234' } },
  { id: 4, master_name: CDIR_MASTERS.employee, record_data: { name: 'Anita Rao', empId: 'E002', site: 'Sasti OC', designation: 'Data Entry Operator', status: 'ACTIVE' } },
  { id: 5, master_name: CDIR_MASTERS.employee, record_data: { name: 'Vacant post', site: 'Sasti OC', designation: 'Excavator Operator', status: 'VACANT' } },
  { id: 6, master_name: CDIR_MASTERS.contact, record_data: { name: 'Ravi Kumar', empId: 'e001', contact: '9000000001', emergencyContact: '9000000002', email: 'ravi@example.test' } },
  { id: 8, master_name: 'Shift Master', record_data: { site: 'Sasti OB', shiftName: 'First', shiftCode: 'A', startTime: '06:00', endTime: '14:00', effectiveFrom: '2026-01-01', effectiveTo: '', status: 'Active', remarks: '' } },
  { id: 7, master_name: 'Users & employees', record_data: { login: 'ravi', passwordHash: 'secret' } },
];

test('Diesel receives the site, region, equipment, employee and driver masters without private fields', () => {
  const feed = dieselMasterFeed(rows);
  assert.deepEqual(feed.region, [{ id: '1', name: 'Western Coalfields Limited', code: 'WCL', state: 'MH / MP', sites: 'Sasti OC | Majri OC' }]);
  assert.deepEqual(feed.site.map(site => [site.name, site.regionCode]), [['Sasti OC', 'WCL'], ['Majri OC', 'WCL']]);
  assert.equal(feed.equipment[0].currentLocation, 'Sasti OC');
  assert.equal(feed.equipment[0].door, 'T-101');
  assert.deepEqual(feed.employee.map(employee => employee.name), ['Ravi Kumar', 'Anita Rao']);
  assert.equal(feed.employee[0].phone, '9000000001');
  assert.deepEqual(feed.driver.map(driver => driver.empId), ['E001']);
  assert.deepEqual(feed.shift, [{ id: '8', site: 'Sasti OC', shiftName: 'First', shiftCode: 'A', startTime: '06:00', endTime: '14:00',
    effectiveFrom: '2026-01-01', effectiveTo: '', status: 'Active', remarks: '' }]);
  assert.doesNotMatch(JSON.stringify(feed), /passwordHash|1990-01-01|100200300400|XXXX1234|9000000002|"login"/);
});

test('the Diesel master feed needs the shared secret and a live Pulse grant', async () => {
  const database = new PGlite();
  const app = express();
  app.use(express.json());
  const secret = 's'.repeat(43), grant = 'g'.repeat(43);
  const session = '59bdc66b-7078-4e0b-8a3b-b60ead7e6691';
  let active = true;
  const issuer = registerDieselSharedSignIn(app, {
    pool: protectDeletionPool(database), secret, enabled: '1',
    requireSession: (_request, _response, next) => next(),
    readSession: async request => active && request.headers.authorization === 'Bearer ' + session ? { login: 'operator', name: 'Operator' } : null,
    checkLocation: async () => false,
    readMasters: async () => ({ masters: dieselMasterFeed(rows), erpDrivers: false }),
  });
  await issuer.initialize();
  await database.query(`INSERT INTO diesel_sso (code_hash, state, challenge, session_token, code_expires_at, grant_hash, grant_expires_at)
    VALUES ('code', 'state', 'challenge', $1, now(), $2, now() + interval '1 hour')`,
    [session, createHash('sha256').update(grant).digest('base64url')]);
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const post = (body, token = secret) => fetch('http://127.0.0.1:' + server.address().port + '/api/diesel-sso/masters', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body),
    });
    assert.equal((await post({ grant }, 'wrong')).status, 401);
    assert.equal((await post({ grant: 'x'.repeat(43) })).status, 401);
    const response = await post({ grant });
    assert.equal(response.status, 200);
    const reply = await response.json();
    assert.deepEqual(Object.keys(reply.masters), ['region', 'site', 'equipment', 'employee', 'driver', 'shift', 'company']);
    assert.equal(reply.erpDrivers, false);
    active = false;
    assert.equal((await post({ grant })).status, 401);
  } finally {
    server.close();
    await database.close();
  }
});

test('the Driver master lists every ERP driver, not only the few in the staff directory', () => {
  const erp = [
    { code: 'D100', name: 'Suresh Yadav', source: 'Vehicle logbook', lastDate: '2026-11-18', location: 'SASTI OB', vehicle: 'T-101' },
    { code: 'D200', name: 'Mahesh Patel', source: 'Equipment logbook', lastDate: '2026-11-20', location: 'Majri OC', vehicle: 'EX-7' },
    { code: 'E001', name: 'RAVI  KUMAR', source: 'Equipment transfer', lastDate: '2026-10-01', location: '', vehicle: 'T-300' },
    // Same code as a directory person with another name: never joined, so no phone is borrowed.
    { code: 'E002', name: 'Someone Else', source: 'Vehicle logbook', lastDate: '2026-09-01', location: 'Majri OC', vehicle: 'T-9' },
    { code: '', name: 'No code', source: 'Vehicle logbook', lastDate: '2026-11-20' },
  ];
  const drivers = dieselMasterFeed(rows, erp).driver;
  assert.deepEqual(drivers.map(driver => driver.empId), ['D200', 'D100', 'E001', 'E002']);
  assert.deepEqual(drivers[1], { id: 'erp:D100', empId: 'D100', name: 'Suresh Yadav', site: 'Sasti OC', vehicle: 'T-101',
    lastDate: '2026-11-18', source: 'Vehicle logbook', designation: '', department: '', status: '', phone: '' });
  assert.deepEqual([drivers[2].designation, drivers[2].phone, drivers[2].site], ['TIPPER DRIVER', '9000000001', 'Sasti OC']);
  assert.equal(drivers[3].phone, '');
  assert.equal(drivers.filter(driver => driver.source === 'Pulse directory').length, 0, 'the joined directory driver is not listed twice');
  assert.deepEqual(dieselMasterFeed(rows, null).driver.map(driver => [driver.empId, driver.source]), [['E001', 'Pulse directory']]);
});

test('the ERP driver list is served from the last read and waits only on the first one', async () => {
  let clock = 0, calls = 0, fail = false;
  const errors = [];
  const reader = createErpDriverReader({ ttlMs: 1000, waitMs: 20, now: () => clock, onError: error => errors.push(error.message),
    read: async () => { calls++; if (fail) throw new Error('ORA-down'); return [{ code: 'D' + calls }]; } });
  assert.deepEqual(await reader(), [{ code: 'D1' }]);
  clock = 500;
  assert.deepEqual(await reader(), [{ code: 'D1' }]);
  assert.equal(calls, 1);
  clock = 2000;
  assert.deepEqual(await reader(), [{ code: 'D1' }], 'an old list is served at once while it refreshes');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(await reader(), [{ code: 'D2' }]);
  fail = true; clock = 5000;
  assert.deepEqual(await reader(), [{ code: 'D2' }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(errors, ['ORA-down']);
  assert.equal(await createErpDriverReader({})(), null);
  const slow = createErpDriverReader({ waitMs: 10, read: () => new Promise(resolve => setTimeout(() => resolve([]), 200)) });
  assert.equal(await slow(), null, 'a slow ERP does not hold the feed');
});

test('LMVs and ERP DG sets join the Equipment master once each, without demo vehicles', () => {
  const feedRows = [...rows,
    { id: 20, master_name: 'LMV master', record_data: { door: 'LMV-7', reg: 'MH34XY0007', currentLocation: 'Sasti OB', make: 'Mahindra', model: 'Bolero', chassisNo: 'CH-7' } },
    { id: 21, master_name: 'LMV master', record_data: { door: 'DEMO-LMV-WCL-1-1', reg: 'DEMO-LMV-WCL-1-1', group: 'LMV', demo: true } },
    // The same tipper as Equipment master row 2, by registration.
    { id: 22, master_name: 'LMV master', record_data: { door: 'T-101', reg: 'MH34AB1234' } },
  ];
  const dg = [
    { oracleEquipmentTno: '900', equipmentId: 'DG-01', equipmentName: 'DG SET 125 KVA', currentLocation: 'MAJRI OC', category: 'PLANT', group: '', make: 'Kirloskar', manufacturerSerialNo: 'K-1' },
    { oracleEquipmentTno: '901', equipmentId: 'DG-01', equipmentName: 'DG SET 125 KVA again', manufacturerSerialNo: 'K-1' },
  ];
  const equipment = dieselMasterFeed(feedRows, [], dg).equipment;
  assert.deepEqual(equipment.map(record => [record.id, record.door, record.group, record.currentLocation]), [
    ['2', 'T-101', '', 'Sasti OC'], ['lmv:20', 'LMV-7', 'LMV', 'Sasti OC'], ['erp-dg:900', 'DG-01', 'DG set', 'Majri OC']]);
  assert.equal(equipment[2].make, 'Kirloskar');
  assert.equal(dieselMasterFeed(feedRows, [], null).equipment.length, 2);
});

test('the Company master sends the ERP company code, name and plain address columns only', () => {
  const companies = dieselMasterFeed(rows, [], [], [
    { COMPANYCODE: 'CMLL', COMPANYNAME: 'Caliber Mining and Logistics Ltd', COMPANYSHORTNAME: 'CMLL', COMPANYTYPECODE: 'PUBLIC', CITY: 'Chandrapur', STATECODE: 'MH',
      PINCODE: '442401', PHONENO: '', MOBILENO: '9000000000', EMAILID: 'info@example.test', GSTNO: '27ABCDE1234F1Z5', BANKACCOUNTNO: '1234567890', TDSLOGINPASSWORD: 'secret' },
    { COMPANYCODE: 'X', COMPANYNAME: '' },
  ]).company;
  assert.deepEqual(companies, [{ id: 'erp-company:CMLL', code: 'CMLL', name: 'Caliber Mining and Logistics Ltd', shortName: 'CMLL', type: 'PUBLIC', owner: '',
    city: 'Chandrapur', state: 'MH', pinCode: '442401', phone: '9000000000', email: 'info@example.test', registrationNo: '27ABCDE1234F1Z5' }]);
  assert.doesNotMatch(JSON.stringify(companies), /1234567890|secret/);
  assert.deepEqual(dieselMasterFeed(rows, [], [], null).company, []);
});
