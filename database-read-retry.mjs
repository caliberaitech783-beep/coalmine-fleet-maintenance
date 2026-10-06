// Only use for idempotent reads outside a transaction. PostgreSQL has already
// aborted a deadlocked statement; replaying a workflow write is not safe here.
export async function retryDatabaseRead(read) {
  try { return await read(); }
  catch (error) {
    if (error?.code !== '40P01') throw error;
    return read();
  }
}
