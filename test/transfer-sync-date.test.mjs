import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { transferSyncDate } from "../transfer-sync-date.mjs";

test("one-time sync dates are strict and do not change the full-history default", () => {
  for (const value of [undefined, null, ""]) assert.equal(transferSyncDate(value), null);
  assert.equal(transferSyncDate("2026-09-03"), "2026-09-03");
  assert.equal(transferSyncDate("2024-02-29"), "2024-02-29");
  for (const value of ["03-09-2026", "2026-02-29", "2026-09-31", "2026-13-01", {}, 20260903, "2026-09-03' OR 1=1"]) assert.throws(() => transferSyncDate(value));
});

test("scoped sync binds the Oracle date and preserves older PostgreSQL history", () => {
  const oracle = fs.readFileSync(new URL("../oracle-db.mjs", import.meta.url), "utf8");
  const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const client = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(oracle, /equipmenttransferdate >= TO_DATE\(:from_date, 'YYYY-MM-DD'\)/);
  assert.match(oracle, /\{ from_date: fromDate \}/);
  assert.match(server, /record_data->>'transferDate'>=\$1/);
  assert.match(server, /oracleEquipmentTransfers\(fromDate\)/);
  assert.match(server, /transferSyncDate\(req.body\?\.fromDate\)/);
  assert.match(server, /if\(equipmentTransferSyncPromise\)throw/);
  assert.match(client, /\[oracleSyncFromDate, setOracleSyncFromDate\] = useState\(""\)/);
});
