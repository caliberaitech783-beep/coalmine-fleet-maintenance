// Logical stored-data sizes, including data-URL/base64 overhead. No media
// payload leaves PostgreSQL, and this report performs SELECTs only.
export const REQUEST_MEDIA_STORAGE_SQL=`
WITH media AS (
  SELECT id,verified_at,'opening_meter_file' AS source,false AS in_counter,opening_meter_file AS data FROM maintenance_requests WHERE opening_meter_file<>''
  UNION ALL SELECT id,verified_at,'closing_meter_file',false,closing_meter_file FROM maintenance_requests WHERE closing_meter_file<>''
  UNION ALL SELECT id,verified_at,'first_trip_card_image',true,first_trip_card_image FROM maintenance_requests WHERE first_trip_card_image<>''
  UNION ALL SELECT id,verified_at,'complaint_audio',true,complaint_audio FROM maintenance_requests WHERE complaint_audio<>''
  UNION ALL SELECT id,verified_at,'maintenance_audio',true,maintenance_audio FROM maintenance_requests WHERE maintenance_audio<>''
  UNION ALL SELECT r.id,r.verified_at,'complaint_media',true,item->>'data'
    FROM maintenance_requests r CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r.complaint_media)='array' THEN r.complaint_media ELSE '[]'::jsonb END) item
    WHERE COALESCE(item->>'data','')<>''
), classified AS (
  SELECT id,source,in_counter,octet_length(data)::bigint AS bytes,
    CASE WHEN verified_at IS NULL THEN 'unverified' WHEN verified_at<$1::timestamptz THEN 'beforeOctober' WHEN verified_at<$2::timestamptz THEN 'october' ELSE 'afterOctober' END AS period,
    CASE WHEN substring(data FROM 1 FOR 40) LIKE 'data:image/%' THEN 'images' WHEN substring(data FROM 1 FOR 40) LIKE 'data:video/%' THEN 'videos' WHEN substring(data FROM 1 FOR 40) LIKE 'data:audio/%' THEN 'audio' WHEN substring(data FROM 1 FOR 40) LIKE 'data:application/pdf;%' THEN 'pdfs' ELSE 'other' END AS kind
  FROM media
)
SELECT period,kind,source,in_counter,COUNT(*)::int AS files,COUNT(DISTINCT id)::int AS requests,SUM(bytes)::bigint AS bytes
FROM classified GROUP BY period,kind,source,in_counter ORDER BY period,kind,source`;
export const COUNTER_RECONCILIATION_SQL=`SELECT
  CASE WHEN verified_at IS NULL THEN 'unverified' WHEN verified_at<$1::timestamptz THEN 'beforeOctober' WHEN verified_at<$2::timestamptz THEN 'october' ELSE 'afterOctober' END AS period,
  COUNT(*)::int AS requests,
  COALESCE(SUM(octet_length(complaint_audio)+octet_length(complaint_media::text)+octet_length(maintenance_audio)+octet_length(first_trip_card_image)),0)::bigint AS bytes
FROM maintenance_requests GROUP BY period`;
export async function requestMediaStorage(pool){
  const client=await pool.connect();
  try{
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='90s'");
    const limits=['2026-09-30T18:30:00.000Z','2026-10-31T18:30:00.000Z'];
    const {rows:details}=await client.query(REQUEST_MEDIA_STORAGE_SQL,limits);
    const {rows:counters}=await client.query(COUNTER_RECONCILIATION_SQL,limits);
    await client.query('COMMIT');
    const labels={beforeOctober:'MIS verified before October 2026',october:'MIS verified during October 2026',unverified:'Unverified requests',afterOctober:'MIS verified after October 2026'};
    const periods=Object.entries(labels).map(([key,label])=>{
      const rows=details.filter(row=>row.period===key).map(row=>({...row,bytes:Number(row.bytes)}));
      const counter=counters.find(row=>row.period===key);
      const types=Object.fromEntries(['images','videos','audio','pdfs','other'].map(kind=>[kind,{files:rows.filter(row=>row.kind===kind).reduce((sum,row)=>sum+row.files,0),bytes:rows.filter(row=>row.kind===kind).reduce((sum,row)=>sum+row.bytes,0)}]));
      const counterBytes=Number(counter?.bytes||0),counterPayloadBytes=rows.filter(row=>row.in_counter).reduce((sum,row)=>sum+row.bytes,0);
      return {key,label,requests:counter?.requests||0,types,totalBytes:rows.reduce((sum,row)=>sum+row.bytes,0),counterBytes,counterPayloadBytes,counterJsonOverheadBytes:counterBytes-counterPayloadBytes,additionalTripCardBytes:rows.filter(row=>!row.in_counter).reduce((sum,row)=>sum+row.bytes,0),details:rows};
    });
    return {checkedAt:new Date().toISOString(),timezone:'Asia/Kolkata',basis:'MIS verification date; unverified includes every request without verified_at',measurement:'Logical stored data-URL bytes (base64 included), not physical Azure disk usage',periods,totals:periods.reduce((sum,row)=>({totalBytes:sum.totalBytes+row.totalBytes,counterBytes:sum.counterBytes+row.counterBytes,counterJsonOverheadBytes:sum.counterJsonOverheadBytes+row.counterJsonOverheadBytes,additionalTripCardBytes:sum.additionalTripCardBytes+row.additionalTripCardBytes}),{totalBytes:0,counterBytes:0,counterJsonOverheadBytes:0,additionalTripCardBytes:0})};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}
