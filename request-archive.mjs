import {createHash,randomUUID} from 'node:crypto';

// Explicitly excludes every request created on September 30 in India.
export const ARCHIVE_CUTOFF='2026-09-29T18:30:00.000Z';
export const archiveSchemaSql=`
  ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
  ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS archive_batch_id UUID;
  CREATE TABLE IF NOT EXISTS request_archive_batches (
    id UUID PRIMARY KEY, cutoff TIMESTAMPTZ NOT NULL, actor TEXT NOT NULL,
    reason TEXT NOT NULL, references_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), restored_at TIMESTAMPTZ,
    restored_by TEXT
  );
  CREATE OR REPLACE FUNCTION protect_archived_request() RETURNS trigger AS $$
  BEGIN
    IF OLD.archived_at IS NOT NULL THEN
      IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
      IF current_setting('bdms.archive_operation',true) IS DISTINCT FROM 'restore' THEN
        RAISE EXCEPTION 'Archived requests are read-only. Restore the archive batch first.';
      END IF;
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END; $$ LANGUAGE plpgsql;
  DROP TRIGGER IF EXISTS protect_archived_request_trigger ON maintenance_requests;
  CREATE TRIGGER protect_archived_request_trigger BEFORE UPDATE OR DELETE ON maintenance_requests
    FOR EACH ROW EXECUTE FUNCTION protect_archived_request();
`;

const eligibleSql=`archived_at IS NULL AND created_at < $1::timestamptz
  AND verified_at IS NULL AND lower(btrim(COALESCE(verification_status,''))) <> 'verified'
  AND lower(btrim(COALESCE(status,''))) <> 'verified'`;
const digest=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const fail=(message,status=409)=>Object.assign(new Error(message),{status});

export async function previewRequestArchive(client){
  const {rows}=await client.query(`SELECT reference,site,status,created_at AS "createdAt"
    FROM maintenance_requests WHERE ${eligibleSql} ORDER BY reference`,[ARCHIVE_CUTOFF]);
  return {cutoff:ARCHIVE_CUTOFF,count:rows.length,token:digest(rows),requests:rows};
}

export async function archiveRequests(pool,{token,actor,reason}={}){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)||typeof actor!=='string'||!actor.trim()
    ||typeof reason!=='string'||!reason.trim()||reason.length>2000)throw fail('A preview token, actor and archive reason (up to 2,000 characters) are required.',400);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='30s'");
    // Serialize the preview comparison and archive against verification/creation.
    await client.query('LOCK TABLE maintenance_requests IN SHARE ROW EXCLUSIVE MODE');
    const preview=await previewRequestArchive(client);
    if(preview.token!==token)throw fail('Matching requests changed. Preview again before archiving.');
    if(!preview.count){await client.query('COMMIT');return {count:0,batchId:null};}
    const batchId=randomUUID();
    const references=preview.requests.map(row=>row.reference);
    await client.query(`INSERT INTO request_archive_batches(id,cutoff,actor,reason,references_json)
      VALUES($1,$2,$3,$4,$5::jsonb)`,[batchId,ARCHIVE_CUTOFF,actor,String(reason).trim(),JSON.stringify(references)]);
    const result=await client.query(`UPDATE maintenance_requests SET archived_at=NOW(),archive_batch_id=$2
      WHERE ${eligibleSql} RETURNING reference`,[ARCHIVE_CUTOFF,batchId]);
    if(result.rowCount!==preview.count)throw fail('Archive count changed; nothing was archived.');
    await client.query('COMMIT');
    return {batchId,count:result.rowCount,cutoff:ARCHIVE_CUTOFF};
  }catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
}

export async function restoreRequestArchive(pool,{batchId,actor}={}){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(batchId||''))
    ||typeof actor!=='string'||!actor.trim())throw fail('Archive batch ID and actor are required.',400);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='30s'");
    await client.query('LOCK TABLE maintenance_requests IN SHARE ROW EXCLUSIVE MODE');
    const {rows}=await client.query('SELECT * FROM request_archive_batches WHERE id=$1 FOR UPDATE',[batchId]);
    if(!rows.length)throw fail('Archive batch not found.',404);
    if(rows[0].restored_at){await client.query('COMMIT');return {batchId,count:0,alreadyRestored:true};}
    // Do not silently reinstate overlapping active breakdowns created since archival.
    const conflicts=await client.query(`SELECT a.reference FROM maintenance_requests a
      JOIN maintenance_requests live ON live.archived_at IS NULL
        AND (lower(btrim(live.status))='running bd' OR (live.verified_at IS NULL
          AND live.closed_at IS NULL AND lower(btrim(live.status))<>'closed'))
        AND ((btrim(a.door_number)<>'' AND lower(btrim(a.door_number))=lower(btrim(live.door_number)))
          OR (btrim(a.chassis_number)<>'' AND lower(btrim(a.chassis_number))=lower(btrim(live.chassis_number))))
      WHERE a.archive_batch_id=$1 AND a.archived_at IS NOT NULL
        AND (lower(btrim(a.status))='running bd' OR (a.verified_at IS NULL
          AND a.closed_at IS NULL AND lower(btrim(a.status))<>'closed')) LIMIT 1`,[batchId]);
    if(conflicts.rows.length)throw fail('Restore would create overlapping active breakdowns. Resolve the active vehicle conflict first.');
    await client.query("SET LOCAL bdms.archive_operation='restore'");
    const result=await client.query('UPDATE maintenance_requests SET archived_at=NULL,archive_batch_id=NULL WHERE archive_batch_id=$1 AND archived_at IS NOT NULL RETURNING reference',[batchId]);
    if(result.rowCount!==rows[0].references_json.length)throw fail('Archive batch is incomplete; restore cancelled.');
    await client.query('UPDATE request_archive_batches SET restored_at=NOW(),restored_by=$2 WHERE id=$1',[batchId,actor]);
    await client.query('COMMIT');
    return {batchId,count:result.rowCount};
  }catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
}
