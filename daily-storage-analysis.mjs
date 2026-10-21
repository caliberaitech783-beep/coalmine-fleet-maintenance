// Read-only current inventory. Event dates are proxies, never upload timestamps.
export async function dailyStorageAnalysis(pool){
  const client=await pool.connect();
  try{
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='90s'");
    const cutoff='2026-10-16T18:30:00Z';
    const {rows:media}=await client.query(`WITH media AS (
      SELECT created_at AS event_at,'opening' AS source,opening_meter_file AS data FROM maintenance_requests WHERE opening_meter_file<>''
      UNION ALL SELECT closed_at,'closing',closing_meter_file FROM maintenance_requests WHERE closing_meter_file<>''
      UNION ALL SELECT first_trip_at,'firstTrip',first_trip_card_image FROM maintenance_requests WHERE first_trip_card_image<>''
      UNION ALL SELECT created_at,'complaintAudio',complaint_audio FROM maintenance_requests WHERE complaint_audio<>''
      UNION ALL SELECT closed_at,'maintenanceAudio',maintenance_audio FROM maintenance_requests WHERE maintenance_audio<>''
      UNION ALL SELECT r.created_at,'complaintAttachment',item->>'data' FROM maintenance_requests r
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r.complaint_media)='array' THEN r.complaint_media ELSE '[]'::jsonb END) item
        WHERE COALESCE(item->>'data','')<>''
    ), classified AS (
      SELECT CASE WHEN event_at IS NULL THEN 'Unknown date' WHEN event_at<$1::timestamptz THEN 'Before 17 October' ELSE to_char(event_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD') END AS day,
        source,octet_length(data)::bigint AS bytes,pg_column_size(data)::bigint AS stored_bytes,
        CASE WHEN source IN ('complaintAudio','maintenanceAudio') THEN 'audio' WHEN source='firstTrip' THEN 'images'
          WHEN substring(data FROM 1 FOR 40) LIKE 'data:image/%' THEN 'images'
          WHEN substring(data FROM 1 FOR 40) LIKE 'data:audio/%' THEN 'audio'
          WHEN substring(data FROM 1 FOR 40) LIKE 'data:video/%' THEN 'videos' ELSE 'other' END AS kind
      FROM media
    ) SELECT day,kind,source,COUNT(*)::int AS files,SUM(bytes)::text AS bytes,SUM(stored_bytes)::text AS stored_bytes
      FROM classified GROUP BY day,kind,source ORDER BY day,kind,source`,[cutoff]);
    const {rows:reports}=await client.query(`SELECT to_char(created_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD') AS day,
      COUNT(*)::int AS files,SUM(octet_length(file_data))::text AS bytes,SUM(pg_column_size(file_data))::text AS stored_bytes
      FROM published_reports WHERE created_at>=$1 GROUP BY day ORDER BY day`,[cutoff]);
    const {rows:tables}=await client.query(`SELECT relname AS name,pg_total_relation_size(relid)::text AS total_bytes,
      pg_table_size(relid)::text AS table_bytes,pg_indexes_size(relid)::text AS index_bytes,n_live_tup::text AS live_rows,n_dead_tup::text AS dead_rows
      FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 12`);
    await client.query('COMMIT');
    return {checkedAt:new Date().toISOString(),cutoff,media,reports,tables,
      caveat:'Current retained files only. Days use request creation for opening/complaint files, closure for closing/maintenance audio, first-trip event for first-trip cards. These are mutable event dates, not upload timestamps. 17 October includes pre-deployment hours. No historical table-size snapshots exist in this report; physical growth cannot be reconciled exactly.'};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}
