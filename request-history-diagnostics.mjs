// Aggregate evidence only: no request references, names, or media leave the DB.
export async function measureRequestHistoryPayload(pool) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout='5s'");
    const {rows}=await client.query(`SELECT COUNT(*)::int AS "requests",
      COUNT(*) FILTER (WHERE jsonb_array_length(workflow_history)>0)::int AS "historyRequests",
      COALESCE(SUM(octet_length(workflow_history::text)) FILTER (WHERE jsonb_array_length(workflow_history)>0),0)::bigint AS "historyBytesRemovedFromFeed"
      FROM maintenance_requests WHERE archived_at IS NULL`);
    await client.query('COMMIT');
    return rows[0];
  } catch(error) {await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally {client.release();}
}
