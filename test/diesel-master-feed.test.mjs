import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import { dieselMasterFeed } from '../diesel-master-feed.mjs';
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
    readMasters: async () => dieselMasterFeed(rows),
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
    assert.deepEqual(Object.keys((await response.json()).masters), ['region', 'site', 'equipment', 'employee', 'driver']);
    active = false;
    assert.equal((await post({ grant })).status, 401);
  } finally {
    server.close();
    await database.close();
  }
});
