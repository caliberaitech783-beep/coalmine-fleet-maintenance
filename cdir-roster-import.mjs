import {createHash} from 'node:crypto';
import {brotliDecompressSync} from 'node:zlib';
import {CDIR_MASTERS,CDIR_MASTER_NAMES,CDIR_MASTER_FIELDS,CDIR_UNIQUE_KEYS,cdirCaps,cdirNormalizeRecord,cdirEmployeeError,cdirDirectoryFromMasters} from './cdir-masters.mjs';

// Operator-supplied data travels through protected configuration, never public
// source files. A digest makes an approved replacement run only once.
export function decodeCdirRoster(encoded){
  let raw,payload;
  try{
    raw=brotliDecompressSync(Buffer.from(encoded,'base64'),{maxOutputLength:4*1024*1024});
    payload=JSON.parse(raw.toString('utf8'));
  }catch{throw new Error('Invalid compressed C-Dir roster payload.');}
  if(payload.version!==1||!payload.masters||typeof payload.masters!=='object')throw new Error('Unsupported C-Dir roster format.');
  if(Object.keys(payload.masters).some(name=>!CDIR_MASTER_NAMES.includes(name)))throw new Error('Roster includes an unrelated master.');
  const masters={};
  for(const name of CDIR_MASTER_NAMES){
    const rows=payload.masters[name];
    if(!Array.isArray(rows)||rows.length>10000)throw new Error(`Invalid rows for ${name}.`);
    const fields=new Set(CDIR_MASTER_FIELDS[name].map(([key])=>key));
    const seen=new Set();
    masters[name]=rows.map((row,index)=>{
      if(!row||typeof row!=='object'||Array.isArray(row)||Object.entries(row).some(([key,value])=>!fields.has(key)||typeof value!=='string'))
        throw new Error(`Invalid fields in ${name}, row ${index+1}.`);
      const record=cdirNormalizeRecord(name,row),uniqueKey=CDIR_UNIQUE_KEYS[name];
      if(uniqueKey){
        const value=cdirCaps(record[uniqueKey]);
        if(!value||seen.has(value))throw new Error(`Missing or duplicate key in ${name}, row ${index+1}.`);
        seen.add(value);
      }
      return record;
    });
  }
  const employees=masters[CDIR_MASTERS.employee];
  const siteCodes=new Set();
  for(const site of masters[CDIR_MASTERS.site]){
    if(!site.code||siteCodes.has(site.code))throw new Error('Missing or duplicate site code.');
    siteCodes.add(site.code);
    if(!masters[CDIR_MASTERS.region].some(region=>region.code===site.region))throw new Error('Invalid site region.');
  }
  if(!employees.length||employees.length!==payload.expectedRows)throw new Error('Roster employee count does not match the approved count.');
  for(const [index,employee] of employees.entries()){
    if(cdirEmployeeError(employee,masters))throw new Error(`Invalid employee reference or status at row ${index+1}.`);
    for(const [field,master,key] of [['department',CDIR_MASTERS.department,'department'],['designation',CDIR_MASTERS.designation,'designation']]){
      if(employee[field]&&!masters[master].some(row=>cdirCaps(row[key])===cdirCaps(employee[field])))throw new Error(`Missing ${field} reference at row ${index+1}.`);
    }
  }
  const ids=new Map();
  for(const employee of employees.filter(row=>row.status!=='VACANT'&&row.empId)){
    const id=cdirCaps(employee.empId),name=cdirCaps(employee.name);
    if(ids.has(id)&&ids.get(id)!==name)throw new Error('The same employee ID belongs to different names.');
    ids.set(id,name);
  }
  const contactIds=new Set();
  for(const row of masters[CDIR_MASTERS.contact]){
    const key=row.empId?`id:${cdirCaps(row.empId)}`:`name:${cdirCaps(row.name)}`;
    if(!row.name||contactIds.has(key))throw new Error('Missing or duplicate contact identity.');
    contactIds.add(key);
  }
  const directory=cdirDirectoryFromMasters(masters);
  if(directory.meta.totalStaffSanctioned!==employees.length)throw new Error('Some roster rows cannot be placed in the directory.');
  return {revision:createHash('sha256').update(raw).digest('hex'),masters,summary:{
    rows:employees.length,active:directory.meta.totalFilled,vacant:directory.meta.totalVacant,
    sites:directory.meta.totalSitesOffices,departments:directory.meta.totalDepartments,
  }};
}

export async function replaceCdirRoster(pool,encoded){
  if(!encoded)return null;
  const {revision,masters,summary}=decodeCdirRoster(encoded);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('cdir-roster-replacement'))");
    await client.query(`CREATE TABLE IF NOT EXISTS cdir_roster_imports (
      revision TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      summary JSONB NOT NULL,previous_records JSONB NOT NULL)`);
    const prior=await client.query('SELECT summary FROM cdir_roster_imports WHERE revision=$1',[revision]);
    if(prior.rowCount){await client.query('COMMIT');return {revision,...prior.rows[0].summary,applied:false};}
    // Exclude concurrent master edits while the backup and replacement commit.
    await client.query('LOCK TABLE master_records IN SHARE ROW EXCLUSIVE MODE');
    const previous=await client.query('SELECT id,master_name,record_data,created_at FROM master_records WHERE master_name=ANY($1::text[]) ORDER BY id',[CDIR_MASTER_NAMES]);
    // Keep live site IDs and roster links used by existing directory bookmarks.
    for(const site of masters[CDIR_MASTERS.site]){
      const existing=previous.rows.find(row=>row.master_name===CDIR_MASTERS.site&&cdirCaps(row.record_data.name)===cdirCaps(site.name))?.record_data;
      if(existing)for(const key of ['code','rosterKey','inRoster'])if(existing[key]!=null)site[key]=String(existing[key]);
    }
    if(cdirDirectoryFromMasters(masters).meta.totalStaffSanctioned!==summary.rows)throw new Error('Live site mappings cannot place every imported row.');
    await client.query('INSERT INTO cdir_roster_imports (revision,summary,previous_records) VALUES ($1,$2::jsonb,$3::jsonb)',[revision,JSON.stringify(summary),JSON.stringify(previous.rows)]);
    await client.query('DELETE FROM master_records WHERE master_name=ANY($1::text[])',[CDIR_MASTER_NAMES]);
    for(const name of CDIR_MASTER_NAMES){
      if(!masters[name].length)continue;
      await client.query(`INSERT INTO master_records (master_name,record_data)
        SELECT $1,value FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS item(value,position) ORDER BY position`,[name,JSON.stringify(masters[name])]);
    }
    await client.query('COMMIT');
    return {revision,...summary,applied:true};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{client.release();}
}
