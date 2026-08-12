import assert from "node:assert/strict";
import test from "node:test";

import { batchMasterRecords, MASTER_IMPORT_BATCH_SIZE } from "../record-batches.mjs";

test("large master imports are divided into Azure-safe batches", () => {
  const records = Array.from({ length: MASTER_IMPORT_BATCH_SIZE * 2 + 17 }, (_, id) => ({ id }));
  const batches = batchMasterRecords(records);

  assert.deepEqual(batches.map((batch) => batch.length), [250, 250, 17]);
  assert.deepEqual(batches.flat(), records);
});

test("small and empty imports keep their expected shape", () => {
  assert.deepEqual(batchMasterRecords([{ id: 1 }]), [[{ id: 1 }]]);
  assert.deepEqual(batchMasterRecords([]), []);
});
