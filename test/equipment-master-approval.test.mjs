import assert from 'node:assert/strict';
import test from 'node:test';
import {equipmentApprovers, prepareEquipmentApproval, verifyEquipmentApproval} from '../equipment-master-approval.mjs';

const secret = 'test-secret-for-equipment-approval-only';
const accounts = equipmentApprovers.map((name, index) => ({name, id: index + 1, mobile: '900000000' + index}));

for (const pair of [[0, 1], [0, 2], [1, 2]]) {
  test('accepts two distinct approvers ' + pair.join(', '), () => {
    const change = {operation: 'delete', id: 42};
    const {request, recipients} = prepareEquipmentApproval({change, accounts, secret});
    change.id = 99;
    const verify = index => verifyEquipmentApproval(request, {...recipients[index], secret});
    assert.equal(verify(pair[0]), 'pending');
    assert.equal(verify(pair[0]), 'unavailable');
    assert.equal(verify(pair[1]), 'approved');
    assert.equal(verify(pair[1]), 'closed');
    assert.equal(request.change.id, 42);
  });
}

test('rejects expired OTPs and locks an approver after repeated invalid attempts', () => {
  const {request, recipients} = prepareEquipmentApproval({change: {}, accounts, secret, now: 1000});
  const verify = (code, now) => verifyEquipmentApproval(request, {approver: 1, code, secret, now});
  for (let attempt = 0; attempt < 5; attempt++) assert.equal(verify('000000', 1000), 'invalid');
  assert.equal(verify(recipients[0].code, 1000), 'unavailable');
  assert.equal(verify(recipients[0].code, request.expiresAt), 'closed');
});

test('rejects duplicate recipient phone numbers', () => {
  const duplicate = accounts.map(account => ({...account, mobile: accounts[0].mobile}));
  assert.throws(() => prepareEquipmentApproval({change: {}, accounts: duplicate, secret}), /distinct/);
});

test('approval and equipment write commit together and a completed request cannot apply twice', async () => {
  const {PGlite} = await import('@electric-sql/pglite');
  const {equipmentApprovalSchema, saveEquipmentApproval, applyEquipmentApproval} = await import('../equipment-master-approval.mjs');
  const db = new PGlite();
  const query = db.query.bind(db);
  const pool = {query, connect: async () => ({query, release() {}})};
  try {
    await db.exec(equipmentApprovalSchema + 'CREATE TABLE equipment_test (door TEXT PRIMARY KEY);');
    const {request, recipients} = prepareEquipmentApproval({change: {door: 'E42'}, accounts, secret});
    await saveEquipmentApproval(pool, request);
    const apply = (index, write) => applyEquipmentApproval(pool, request.id, {...recipients[index], secret}, write);
    const insert = (client, change) => client.query('INSERT INTO equipment_test VALUES ($1)', [change.door]);
    assert.equal(await apply(0, insert), 'pending');
    assert.deepEqual((await query('SELECT * FROM equipment_test')).rows, []);
    await assert.rejects(apply(1, async (client, change) => {
      await insert(client, change);
      throw new Error('write failed');
    }), /write failed/);
    assert.deepEqual((await query('SELECT * FROM equipment_test')).rows, []);
    assert.equal(await apply(1, insert), 'approved');
    assert.equal(await apply(2, insert), 'closed');
    assert.deepEqual((await query('SELECT * FROM equipment_test')).rows, [{door: 'E42'}]);
  } finally {
    await db.close();
  }
});

test('resolves approver mobile numbers from Pulse Login Master only', async () => {
  const {PGlite} = await import('@electric-sql/pglite');
  const {prepareEquipmentApprovalFromLoginMaster} = await import('../equipment-master-approval.mjs');
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE master_records (id BIGSERIAL PRIMARY KEY, master_name TEXT, record_data JSONB)');
    for (const [index, account] of accounts.entries()) {
      const nameField = index === 0 ? 'name' : 'employee';
      const phoneField = ['phone', 'phoneNo', 'phoneNumber'][index];
      const data = JSON.stringify({[nameField]: account.name.toUpperCase(), [phoneField]: account.mobile});
      await db.query('INSERT INTO master_records (master_name, record_data) VALUES ($1, $2)', ['Users & employees', data]);
      await db.query('INSERT INTO master_records (master_name, record_data) VALUES ($1, $2)', ['Employee master', data]);
    }
    const input = {change: {operation: 'edit'}, secret};
    const {recipients} = await prepareEquipmentApprovalFromLoginMaster(db, input);
    assert.deepEqual(recipients.map(row => row.phone), accounts.map(row => '91' + row.mobile));
    await db.query("DELETE FROM master_records WHERE master_name = 'Users & employees' AND id = 1");
    await assert.rejects(prepareEquipmentApprovalFromLoginMaster(db, input), /unique Login Master account/);
  } finally {
    await db.close();
  }
});

test('one code is sent to the three authorized numbers and approves only once', async () => {
  const {prepareSharedEquipmentApproval} = await import('../equipment-master-approval.mjs');
  for (const operation of ['add', 'edit', 'delete']) {
    const change = {operation, id: 42};
    const {request, recipients} = prepareSharedEquipmentApproval({change, secret});
    assert.deepEqual(recipients.map(row => row.phone), ['919850396090', '917828619175', '919423604667']);
    assert.equal(new Set(recipients.map(row => row.code)).size, 1);
    change.id = 99;
    const code = recipients[0].code;
    assert.equal(verifyEquipmentApproval(request, {code, secret}), 'approved');
    assert.deepEqual(request.change, {operation, id: 42});
    assert.equal(verifyEquipmentApproval(request, {code, secret}), 'closed');
  }
});
