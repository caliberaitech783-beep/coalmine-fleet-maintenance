import assert from 'node:assert/strict';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {createEquipmentMasterChanges, normalizeEquipmentChanges, registerEquipmentMasterChanges, maskPhone} from '../equipment-master-changes.mjs';

const PHONES = ['919850396090', '917828619175', '919423604667'];

async function setup() {
  const db = new PGlite();
  const query = db.query.bind(db);
  const pool = {query, connect: async () => ({query, release() {}})};
  await db.exec('CREATE TABLE master_records (id BIGSERIAL PRIMARY KEY, master_name TEXT NOT NULL, record_data JSONB NOT NULL)');
  const insert = async data => (await query("INSERT INTO master_records (master_name,record_data) VALUES ('Equipment master',$1::jsonb) RETURNING id", [JSON.stringify(data)])).rows[0].id;
  const a = await insert({door: 'D-1', chassisNo: 'CH1'});
  const b = await insert({door: 'D-2', chassisNo: 'CH2'});
  const sent = [];
  const service = createEquipmentMasterChanges({
    pool, env: {},
    normalize: record => ({...record, door: String(record.door || '').toUpperCase()}),
    identity: record => String(record.chassisNo || '').toUpperCase(),
    sendOtp: async message => { sent.push(message); },
  });
  const rows = async () => (await query("SELECT id,record_data FROM master_records WHERE master_name='Equipment master' ORDER BY id")).rows;
  return {db, service, sent, rows, a: Number(a), b: Number(b)};
}

test('one OTP goes to all three authorised mobiles and applies the whole change set once', async () => {
  const {db, service, sent, rows, a, b} = await setup();
  try {
    const request = await service.request({requestedBy: 'Tester', source: 'Pulse-II', changes: [
      {operation: 'add', record: {door: 'd-3', chassisNo: 'CH3'}},
      {operation: 'edit', id: a, record: {door: 'd-1', chassisNo: 'CH1', make: 'Volvo'}},
      {operation: 'delete', id: b, label: 'D-2'},
    ]});
    assert.deepEqual(sent.map(row => row.phone), PHONES);
    assert.equal(new Set(sent.map(row => row.otp)).size, 1);
    assert.match(sent[0].message, /Pulse-II/);
    assert.deepEqual(request.summary, {add: 1, edit: 1, delete: 1, total: 3});
    assert.deepEqual(request.sentTo, PHONES.map(maskPhone));
    assert.equal((await rows()).length, 2, 'nothing changes before the OTP');

    await assert.rejects(service.verify(request.id, '000000'.replace(/./g, (_, i) => String((Number(sent[0].otp[i]) + 1) % 10))), /Wrong OTP/);
    const result = await service.verify(request.id, sent[0].otp);
    assert.equal(result.summary.total, 3);
    const after = await rows();
    assert.deepEqual(after.map(row => row.record_data.door), ['D-1', 'D-3']);
    assert.equal(after[0].record_data.make, 'Volvo');
    await assert.rejects(service.verify(request.id, sent[0].otp), /expired or was already used/);
  } finally { await db.close(); }
});

test('a conflicting change rolls the whole set back and keeps the OTP usable', async () => {
  const {db, service, sent, rows, a, b} = await setup();
  try {
    const request = await service.request({requestedBy: 'Tester', changes: [
      {operation: 'delete', id: a},
      {operation: 'edit', id: b, record: {door: 'D-2', chassisNo: 'CH2'}},
    ]});
    await db.query('DELETE FROM master_records WHERE id=$1', [b]);
    await assert.rejects(service.verify(request.id, sent[0].otp), /no longer exists/);
    assert.equal((await rows()).length, 1, 'record a was not deleted');
  } finally { await db.close(); }
});

test('rejects duplicate adds, unknown records and five wrong codes', async () => {
  const {db, service, sent, a} = await setup();
  try {
    const dup = await service.request({requestedBy: 'T', changes: [{operation: 'add', record: {door: 'X', chassisNo: 'CH7'}}]});
    await db.query("INSERT INTO master_records (master_name,record_data) VALUES ('Equipment master','{\"door\":\"Y\",\"chassisNo\":\"CH7\"}'::jsonb)");
    await assert.rejects(service.verify(dup.id, sent.at(-1).otp), /already exists/);
    await assert.rejects(service.request({requestedBy: 'T', changes: [{operation: 'delete', id: 99999}]}), /no longer exists/);
    const locked = await service.request({requestedBy: 'T', changes: [{operation: 'delete', id: a}]});
    const wrong = sent.at(-1).otp === '111111' ? '222222' : '111111';
    for (let i = 0; i < 5; i++) await assert.rejects(service.verify(locked.id, wrong), /Wrong OTP/);
    await assert.rejects(service.verify(locked.id, sent.at(-1).otp), /Too many wrong attempts/);
  } finally { await db.close(); }
});

test('validates the staged list', () => {
  assert.throws(() => normalizeEquipmentChanges([]), /at least one/);
  assert.throws(() => normalizeEquipmentChanges([{operation: 'move'}]), /add, edit or delete/);
  assert.throws(() => normalizeEquipmentChanges([{operation: 'delete', id: 4}, {operation: 'edit', id: 4, record: {}}]), /changed twice/);
  assert.throws(() => normalizeEquipmentChanges([{operation: 'add'}]), /details are required/);
});

test('fails when no mobile receives the OTP', async () => {
  const {db} = await setup();
  try {
    const query = db.query.bind(db);
    const service = createEquipmentMasterChanges({pool: {query, connect: async () => ({query, release() {}})}, env: {}, sendOtp: async () => { throw new Error('paused'); }});
    await assert.rejects(service.request({requestedBy: 'T', changes: [{operation: 'add', record: {door: 'Z'}}]}), /could not be sent/);
  } finally { await db.close(); }
});

test('direct Equipment master writes are closed; other masters pass', () => {
  const uses = [];
  const app = {use: (path, fn) => uses.push([path, fn]), post() {}};
  registerEquipmentMasterChanges(app, {service: {}, requireSuper: (_req, _res, next) => next()});
  const [path, middleware] = uses[0];
  assert.equal(path, '/api/masters/:master');
  const run = (method, master) => {
    let status = 200, passed = false;
    const res = {status(code) { status = code; return res; }, json() { return res; }};
    middleware({method, params: {master: encodeURIComponent(master)}}, res, () => { passed = true; });
    return passed ? 'next' : status;
  };
  for (const method of ['POST', 'PUT', 'DELETE']) assert.equal(run(method, 'Equipment master'), 409);
  assert.equal(run('GET', 'Equipment master'), 'next');
  assert.equal(run('POST', 'Region master'), 'next');
});

test('an imported row that matches an existing record is approved and applied as an overwrite', async () => {
  const {db, service, sent, rows, a} = await setup();
  try {
    const request = await service.request({requestedBy: 'Tester', changes: [
      {operation: 'add', record: {door: 'd-1', chassisNo: 'ch1', make: 'BEML'}},
      {operation: 'add', record: {door: 'd-9', chassisNo: 'CH9'}},
      {operation: 'add', record: {door: 'd-9b', chassisNo: 'ch9'}},
    ]});
    assert.deepEqual(request.summary, {add: 1, edit: 1, delete: 0, total: 2});
    assert.match(sent[0].message, /1 add, 1 edit/);
    await service.verify(request.id, sent[0].otp);
    const after = await rows();
    assert.equal(after.length, 3);
    assert.equal(after.find(row => Number(row.id) === a).record_data.make, 'BEML');
    assert.equal(after.at(-1).record_data.door, 'D-9B', 'the last repeated row wins');
  } finally { await db.close(); }
});

test('an import cannot overwrite a record that the same list also edits or deletes', async () => {
  const {db, service, a} = await setup();
  try {
    await assert.rejects(service.request({requestedBy: 'Tester', changes: [
      {operation: 'delete', id: a},
      {operation: 'add', record: {door: 'D-1', chassisNo: 'CH1'}},
    ]}), /already changed in this list/);
  } finally { await db.close(); }
});
