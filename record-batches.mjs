export const MASTER_IMPORT_BATCH_SIZE = 250;

export function batchMasterRecords(records, batchSize = MASTER_IMPORT_BATCH_SIZE) {
  if (!Array.isArray(records)) return [];
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new TypeError("Batch size must be a positive integer.");
  }

  const batches = [];
  for (let index = 0; index < records.length; index += batchSize) {
    batches.push(records.slice(index, index + batchSize));
  }
  return batches;
}
