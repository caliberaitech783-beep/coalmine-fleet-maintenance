// Inventory and hashing only. No file payload leaves PostgreSQL.
export async function auditPublishedReports(pool,onProgress=()=>{}){
  const client=await pool.connect();
  try{
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='90s'");
    const {rows}=await client.query(`SELECT id,filename,content_type,created_at,expires_at,octet_length(file_data)::text AS bytes,pg_column_size(file_data)::text AS stored_bytes FROM published_reports ORDER BY created_at,id`);
    const sizes=new Map(),names=new Map(),types=new Map();
    const now=Date.now();let expiredBytes=0,older7Bytes=0,totalBytes=0;
    for(const r of rows){
      r.bytes=Number(r.bytes);r.stored_bytes=Number(r.stored_bytes);totalBytes+=r.stored_bytes;
      sizes.set(r.bytes,(sizes.get(r.bytes)||0)+1);
      if(!names.has(r.filename))names.set(r.filename,[]);names.get(r.filename).push(r);
      const type=types.get(r.content_type)||{type:r.content_type,files:0,bytes:0,storedBytes:0};type.files++;type.bytes+=r.bytes;type.storedBytes+=r.stored_bytes;types.set(r.content_type,type);
      if(new Date(r.expires_at).getTime()<=now)expiredBytes+=r.stored_bytes;
      if(new Date(r.created_at).getTime()<now-7*86400000)older7Bytes+=r.stored_bytes;
    }
    const candidates=rows.filter(r=>sizes.get(r.bytes)>1),hashes=new Map();
    const summary={checkedAt:new Date(now).toISOString(),files:rows.length,storedBytes:totalBytes,types:[...types.values()].sort((a,b)=>b.storedBytes-a.storedBytes),expiredBytes,older7Bytes,
      largest:[...rows].sort((a,b)=>b.stored_bytes-a.stored_bytes).slice(0,15),
      repeatedNames:[...names.entries()].filter(([,r])=>r.length>1).map(([name,r])=>({name,files:r.length,storedBytes:r.reduce((s,x)=>s+x.stored_bytes,0)})).sort((a,b)=>b.storedBytes-a.storedBytes).slice(0,15)};
    onProgress({summary,checked:0,candidates:candidates.length});
    for(let i=0;i<candidates.length;i+=20){
      const batch=candidates.slice(i,i+20),byId=new Map(batch.map(r=>[r.id,r]));
      const {rows:digests}=await client.query(`SELECT id,encode(sha256(file_data),'hex') AS digest FROM published_reports WHERE id=ANY($1::uuid[])`,[batch.map(r=>r.id)]);
      for(const h of digests){const r=byId.get(h.id),key=`${r.bytes}:${h.digest}`;if(!hashes.has(key))hashes.set(key,[]);hashes.get(key).push(r);}
      onProgress({summary,checked:Math.min(i+20,candidates.length),candidates:candidates.length});
    }
    const duplicates=[...hashes.values()].filter(r=>r.length>1).map(r=>({copies:r.length,bytes:r[0].bytes,
      redundantStoredBytes:r.reduce((s,x)=>s+x.stored_bytes,0)-Math.max(...r.map(x=>x.stored_bytes)),names:[...new Set(r.map(x=>x.filename))].slice(0,5)})).sort((a,b)=>b.redundantStoredBytes-a.redundantStoredBytes);
    await client.query('COMMIT');
    return {...summary,checked:candidates.length,candidates:candidates.length,duplicateGroups:duplicates.length,redundantFiles:duplicates.reduce((s,r)=>s+r.copies-1,0),redundantStoredBytes:duplicates.reduce((s,r)=>s+r.redundantStoredBytes,0),duplicates:duplicates.slice(0,15)};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}
