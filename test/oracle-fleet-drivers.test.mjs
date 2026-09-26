import test from 'node:test';
import assert from 'node:assert/strict';
import oracledb from 'oracledb';

test('fleet driver lookup batches both logbooks, closes connections, shares and caches successful reads', async () => {
  process.env.ORACLE_DB_USER='fixture';
  process.env.ORACLE_DB_PASSWORD='fixture';
  process.env.ORACLE_DB_CONNECT_STRING='fixture';
  let calls=0, closed=0;
  const original=oracledb.createPool;
  const connection={
    async execute(sql) {
      calls++;
      assert.match(sql, /cmpl\.equipmentlogbook/);
      assert.match(sql, /cmpl\.vehiclelogbook/);
      assert.match(sql, /ORDER BY log_date DESC, log_tno DESC/);
      assert.match(sql, /ranked.result_rank = 1/);
      assert.match(sql, /log.vehiclelogbookdate <= SYSDATE/);
      assert.equal(this.callTimeout, 15000);
      if(calls===1) throw new Error('temporary fixture failure');
      return {rows:[{EQUIPMENT_TNO:42, EQUIPMENTNAME:'E04', DRIVER_NAME:'Ravi', DRIVER_AT:'2026-09-25 10:00:00'}]};
    },
    async close(){closed++;},
  };
  oracledb.createPool=async()=>({getConnection:async()=>connection});
  try {
    const {oracleLatestFleetDrivers}=await import('../oracle-db.mjs');
    await assert.rejects(oracleLatestFleetDrivers(), /temporary fixture failure/);
    const [first, second]=await Promise.all([oracleLatestFleetDrivers(), oracleLatestFleetDrivers()]);
    assert.equal(first, second);
    assert.equal(first[0].oracleEquipmentTno, '42');
    assert.equal(first[0].driverName, 'Ravi');
    assert.equal(await oracleLatestFleetDrivers(), first);
    assert.equal(calls, 2);
    assert.equal(closed, 2);
  } finally {oracledb.createPool=original;}
});
