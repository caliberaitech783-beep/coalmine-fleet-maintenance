import path from 'node:path';
import {promises as fs,createReadStream} from 'node:fs';
import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {Readable} from 'node:stream';
import yazl from 'yazl';
import {exportDatabase,streamQueryRows} from './database-backup.mjs';
import {encryptStream} from './backup-crypto.mjs';
import {normalizeBackupSettings,scheduledBackupDue,indiaBackupSlot} from './backup-settings.mjs';

export const FULL_BACKUP_KEY='full_disaster_recovery_v1';
// Owner rule (24 Nov 2026): keep the newest 3 checked full backups; older ones are removed after each new backup.
export const FULL_BACKUP_KEEP=3;
// A run needs room for the database export and the encrypted archive at the same time, plus a margin.
export const FULL_BACKUP_SPACE_MARGIN=5*1024**3;
const BACKUP_FILE=/^full-backup-[a-f0-9-]+\.enc$/;
export const fullDefaults=()=>normalizeBackupSettings({scheduleTime:'03:00',storageFolder:'full-recovery',maxBackups:FULL_BACKUP_KEEP,retentionDays:30});
const gigabytes=bytes=>`${(Number(bytes||0)/1024**3).toFixed(1)} GB`;
const istDay=value=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short'}).format(new Date(value));
const istTime=value=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value));
const timeOf=value=>{const parsed=Date.parse(value instanceof Date?value.toISOString():value);return Number.isFinite(parsed)?parsed:0;};

/**
 * Which backup files in this slot's folder can go. Only backups whose size was checked on disk count,
 * nothing is removed until `keep` of them exist, and only files older than the oldest kept one are removed.
 * The two Azure slots swap at every release and each keeps its own folder, so the catalogue (shared
 * database) decides and each slot removes only its own files.
 */
export function planKeepNewest({rows=[],files=[],keep=FULL_BACKUP_KEEP}={}){
  const finished=row=>['Completed','Partial'].includes(row.status)&&Boolean(row.fileName)&&timeOf(row.completedAt)>0;
  const checked=rows.filter(row=>finished(row)&&Number(row.verifiedBytes)>0).sort((a,b)=>timeOf(b.completedAt)-timeOf(a.completedAt));
  if(checked.length<keep)return {ready:false,checked:checked.length,kept:checked,removeFiles:[],expireRows:[]};
  const kept=checked.slice(0,keep),keepNames=new Set(kept.map(row=>row.fileName)),cutoff=timeOf(kept.at(-1).completedAt);
  const byName=new Map(rows.filter(row=>row.fileName).map(row=>[row.fileName,row]));
  const removeFiles=files.filter(file=>{
    if(!BACKUP_FILE.test(file.name)||keepNames.has(file.name))return false;
    const row=byName.get(file.name),created=row&&timeOf(row.completedAt)?timeOf(row.completedAt):Number(file.mtimeMs)||Infinity;
    return created<cutoff;
  });
  const expireRows=rows.filter(row=>finished(row)&&!keepNames.has(row.fileName)&&timeOf(row.completedAt)<cutoff).map(row=>row.id);
  return {ready:true,checked:checked.length,kept,removeFiles,expireRows};
}

/** Telegram text after a backup or a cleanup; plain words for the owner. */
export function housekeepingMessage({title,newBackup=null,plan,removed=[],disk=null,keep=FULL_BACKUP_KEEP}){
  const lines=[title];
  if(newBackup)lines.push(`New backup: ${istTime(newBackup.completedAt)} IST, ${gigabytes(newBackup.bytes)}, checked complete on disk.`);
  if(plan?.ready){
    lines.push(`Kept (newest ${keep} checked): ${plan.kept.map(row=>istDay(row.completedAt)).join(', ')}.`);
    lines.push(removed.length?`Removed from this server: ${removed.map(file=>`${file.day||'older backup'} ${gigabytes(file.bytes)}`).join(', ')} (${gigabytes(removed.reduce((sum,file)=>sum+Number(file.bytes||0),0))} freed).`:'Removed: nothing older on this server.');
  }else lines.push(`Old backups kept: ${plan?.checked||0} of ${keep} checked backups so far. Removal starts once ${keep} checked backups exist.`);
  lines.push('The other Pulse slot is cleaned when it next goes live after a release.');
  if(disk?.totalBytes)lines.push(`Drive: ${gigabytes(disk.freeBytes)} free of ${gigabytes(disk.totalBytes)}.`);
  return lines.join('\n');
}
export async function fileHash(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
export function validServiceKey(expected,provided){return Boolean(expected&&provided&&Buffer.byteLength(expected)===Buffer.byteLength(provided)&&timingSafeEqual(Buffer.from(expected),Buffer.from(provided)));}
export function hostingCoverage(snapshot,now=Date.now()){
  if(!snapshot)return {status:'Missing',detail:'Azure snapshot has not been collected.'};
  if(!snapshot.capturedAt||!Number.isFinite(Date.parse(snapshot.capturedAt))||now-Date.parse(snapshot.capturedAt)>26*3600000||Date.parse(snapshot.capturedAt)>now+300000)return {status:'Stale',detail:'Azure snapshot must be refreshed (maximum age 26 hours).'};
  return {status:snapshot.complete?'Included':'Partial',detail:snapshot.summary||'Review Azure inventory coverage.'};
}

/** Personal Telegram text for Mohit and Anoop: every file or folder this module deleted on the Azure server. */
export function deletedMessage({title='Pulse Azure server: files deleted',backups=[],leftovers=[],plan=null,disk=null}){
  const lines=[title];
  for(const file of backups)lines.push(`Old backup ${file.day||''} ${gigabytes(file.bytes)} deleted (keep-newest-${FULL_BACKUP_KEEP} rule).`.replace('  ',' '));
  for(const item of leftovers)lines.push(`Half-finished backup work ${item.name} ${gigabytes(item.bytes)} deleted (left by an interrupted backup).`);
  const total=[...backups,...leftovers].reduce((sum,item)=>sum+Number(item.bytes||0),0);
  lines.push(`Total freed: ${gigabytes(total)}.`);
  if(plan?.ready)lines.push(`Backups kept: ${plan.kept.map(row=>istDay(row.completedAt)).join(', ')}.`);
  if(disk?.totalBytes)lines.push(`Drive: ${gigabytes(disk.freeBytes)} free of ${gigabytes(disk.totalBytes)}.`);
  return lines.join('\n');
}

async function sizeOf(target){
  const info=await fs.lstat(target).catch(()=>null);
  if(!info)return 0;
  if(!info.isDirectory())return info.size;
  let total=0;for(const entry of await fs.readdir(target))total+=await sizeOf(path.join(target,entry));
  return total;
}

async function statfsSpace(folder){
  const stats=await fs.statfs(folder);
  return {totalBytes:Number(stats.blocks)*Number(stats.bsize),freeBytes:Number(stats.bavail)*Number(stats.bsize)};
}

export function registerFullBackup(app,{pool,root,storageRoot,requireSuper,requireAdministrator,isReady,scheduledJobsEnabled,commit,env=process.env,record=async()=>{},enqueue=task=>void task(),notify=async()=>{},notifyDelete=async()=>{},diskSpace=statfsSpace,spaceMargin=FULL_BACKUP_SPACE_MARGIN}){
  const folder=path.join(storageRoot,'full-recovery'),snapshotFile=path.join(folder,'azure-hosting.enc'),snapshotInfo=path.join(folder,'azure-status.json');
  let initializing,activeRun=null,housekeptAtStart=false,spaceNoticeSlot=null,lastFailureNotice=0,spaceRetryAt=0;
  const tell=message=>Promise.resolve().then(()=>notify(message)).catch(error=>console.error('Full backup notice failed',error?.message||error));
  // Owner rule (24 Nov 2026): Mohit and Anoop get a personal Telegram for every delete on the Azure server.
  const tellDeleted=async details=>{
    if(!details.backups?.length&&!details.leftovers?.length)return;
    const message=deletedMessage({...details,disk:await space()});
    await Promise.resolve().then(()=>notifyDelete(message)).catch(error=>console.error('Full backup delete notice failed',error?.message||error));
  };
  const space=()=>diskSpace(folder).catch(()=>null);
  async function init(){
    if(!isReady())throw Object.assign(Error('Database is not ready'),{status:503});
    if(!initializing)initializing=(async()=>{
      await fs.mkdir(folder,{recursive:true,mode:0o700});
      await pool.query(`CREATE TABLE IF NOT EXISTS full_backup_runs(id UUID PRIMARY KEY,status TEXT NOT NULL,trigger_type TEXT NOT NULL,slot TEXT UNIQUE,file_name TEXT NOT NULL DEFAULT '',size_bytes BIGINT NOT NULL DEFAULT 0,checksum TEXT NOT NULL DEFAULT '',coverage JSONB NOT NULL DEFAULT '{}'::jsonb,created_by TEXT NOT NULL DEFAULT '',started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),completed_at TIMESTAMPTZ,error_message TEXT NOT NULL DEFAULT '')`);
      // Bytes confirmed on disk after writing; 0 = written before this check existed, never counted as a kept backup.
      await pool.query('ALTER TABLE full_backup_runs ADD COLUMN IF NOT EXISTS verified_bytes BIGINT NOT NULL DEFAULT 0');
      // A process killed during export leaves an explicit failed job, not a false success.
      await pool.query("UPDATE full_backup_runs SET status='Failed',error_message='Backup process interrupted; retry required',completed_at=NOW() WHERE status='Running' AND started_at<NOW()-INTERVAL '6 hours'");
    })().catch(error=>{initializing=null;throw error;});
    await initializing;
  }
  async function settings(){const {rows}=await pool.query('SELECT setting_value FROM app_settings WHERE setting_key=$1',[FULL_BACKUP_KEY]);return rows[0]?normalizeBackupSettings(rows[0].setting_value):fullDefaults();}
  async function snapshot(){return JSON.parse(await fs.readFile(snapshotInfo,'utf8').catch(()=>'null'));}
  async function reconcileInterrupted(){
    if(activeRun)return;
    const client=await pool.connect();let locked=false;
    try{
      locked=(await client.query("SELECT pg_try_advisory_lock(hashtext('bdms_backup_operation')) AS locked")).rows[0]?.locked;
      if(locked)await client.query("UPDATE full_backup_runs SET status='Failed',error_message='Backup worker interrupted. Retry the backup.',completed_at=NOW() WHERE status='Running'");
    }finally{if(locked)await client.query("SELECT pg_advisory_unlock(hashtext('bdms_backup_operation'))").catch(()=>{});client.release();}
  }
  async function progress(){
    const current=activeRun;if(!current)return null;
    const bytes=(await fs.stat(current.file||'').catch(()=>null))?.size||0;
    return {id:current.id,stage:current.stage,bytesWritten:bytes,updatedAt:new Date().toISOString()};
  }
  async function publicKey(){return fs.readFile(path.join(root,'recovery-public.pem'),'utf8');}
  function safeFile(name){if(!BACKUP_FILE.test(name))throw Error('Invalid backup filename');return path.join(folder,name);}
  // Caller holds the shared database lock, which proves no other backup worker owns these files.
  async function removeLeftovers(){
    const realRoot=await fs.realpath(folder),removed=[];
    for(const entry of await fs.readdir(folder,{withFileTypes:true})){
      const candidate=path.join(folder,entry.name);
      if(entry.isDirectory()&&!entry.isSymbolicLink()&&/^work-[a-z0-9]+$/i.test(entry.name)){
        const resolved=await fs.realpath(candidate);
        if(resolved.startsWith(realRoot+path.sep)){const bytes=await sizeOf(candidate);await fs.rm(candidate,{recursive:true,force:true});removed.push({name:entry.name,bytes});}
      }else if(entry.isFile()&&/^full-backup-[a-f0-9-]+\.enc\.partial$/.test(entry.name)){const bytes=await sizeOf(candidate);await fs.rm(candidate,{force:true});removed.push({name:entry.name,bytes});}
    }
    return removed;
  }
  // Keep the newest checked backups; caller holds the shared database lock.
  async function housekeep(){
    const {rows}=await pool.query(`SELECT id,status,file_name AS "fileName",completed_at AS "completedAt",verified_bytes AS "verifiedBytes",size_bytes AS "sizeBytes" FROM full_backup_runs WHERE file_name<>''`);
    const files=[];
    for(const entry of await fs.readdir(folder,{withFileTypes:true})){
      if(!entry.isFile()||entry.isSymbolicLink()||!BACKUP_FILE.test(entry.name))continue;
      const info=await fs.stat(path.join(folder,entry.name));files.push({name:entry.name,bytes:info.size,mtimeMs:info.mtimeMs});
    }
    const plan=planKeepNewest({rows,files}),byName=new Map(rows.map(row=>[row.fileName,row])),removed=[];
    for(const file of plan.removeFiles){
      const row=byName.get(file.name);
      await fs.rm(safeFile(file.name),{force:true});
      removed.push({...file,day:istDay(row?.completedAt||file.mtimeMs)});
    }
    if(plan.expireRows.length)await pool.query("UPDATE full_backup_runs SET status='Removed',error_message=$2 WHERE id=ANY($1::uuid[]) AND status IN ('Completed','Partial')",[plan.expireRows,`Removed by the keep-newest-${FULL_BACKUP_KEEP} rule`]);
    if(removed.length)await record({module:'Full Backup',action:'Remove old full backups',targetType:'Recovery archive',targetReference:removed.map(file=>file.name).join(', ').slice(0,500),outcome:'Success',reason:`Keep newest ${FULL_BACKUP_KEEP} checked backups; ${removed.length} removed`});
    return {plan,removed};
  }
  // After a release the newly live slot may hold old backups and half-written work from before the swap.
  async function housekeepAtStart(){
    const client=await pool.connect();let locked=false;
    try{
      locked=(await client.query("SELECT pg_try_advisory_lock(hashtext('bdms_backup_operation')) AS locked")).rows[0]?.locked;
      if(!locked)return false;
      const leftovers=await removeLeftovers();
      const {plan,removed}=await housekeep();
      if(removed.length)void tell(housekeepingMessage({title:'Pulse backup cleanup after a release',plan,removed,disk:await space()}));
      void tellDeleted({title:'Pulse Azure server: files deleted after a release',backups:removed,leftovers,plan});
      return true;
    }finally{if(locked)await client.query("SELECT pg_advisory_unlock(hashtext('bdms_backup_operation'))").catch(()=>{});client.release();}
  }
  async function neededSpace(){
    const {rows}=await pool.query("SELECT size_bytes AS \"sizeBytes\" FROM full_backup_runs WHERE status IN ('Completed','Partial','Removed') AND size_bytes>0 ORDER BY completed_at DESC NULLS LAST LIMIT 1");
    return 2*Number(rows[0]?.sizeBytes||0)+spaceMargin;
  }
  async function run({trigger='Manual',actor='',slot=null,waitForCompletion=false}={}){
    await init();
    const key=await publicKey().catch(()=>{throw Object.assign(Error('Recovery public key is missing. Configure offline recovery keys first.'),{status:409});});
    const client=await pool.connect();let locked=false,id=randomUUID(),started=false;
    try{
      const {rows}=await client.query("SELECT pg_try_advisory_lock(hashtext('bdms_backup_operation')) AS locked");locked=rows[0]?.locked;
      if(!locked)throw Object.assign(Error('Another backup or restore is running'),{status:409});
      await client.query("UPDATE full_backup_runs SET status='Failed',error_message='Backup worker interrupted. Retry the backup.',completed_at=NOW() WHERE status='Running'");
      const leftovers=await removeLeftovers();
      void tellDeleted({title:'Pulse Azure server: files deleted before a backup',leftovers});
      // A backup that runs out of room is cut short on this drive and cannot be restored: do not start it.
      const [disk,needed]=await Promise.all([space(),neededSpace()]);
      if(disk&&disk.freeBytes<needed){
        const message=`Not enough free space for a full backup: ${gigabytes(disk.freeBytes)} free, ${gigabytes(needed)} needed.`;
        if(spaceNoticeSlot!==(slot||'manual')){spaceNoticeSlot=slot||'manual';void tell(`Pulse full backup NOT started\n${message}\nFree space on the shared drive; the backup retries every 30 minutes.`);}
        throw Object.assign(Error(message),{status:409,code:'FULL_BACKUP_NO_SPACE'});
      }
      const inserted=await client.query("INSERT INTO full_backup_runs(id,status,trigger_type,slot,created_by) VALUES($1,'Running',$2,$3,$4) ON CONFLICT(slot) DO UPDATE SET id=EXCLUDED.id,status='Running',started_at=NOW(),completed_at=NULL,error_message='' WHERE full_backup_runs.status='Failed' RETURNING id",[id,trigger,slot,actor]);
      if(!inserted.rowCount){await client.query("SELECT pg_advisory_unlock(hashtext('bdms_backup_operation'))");client.release();return {skipped:true};}
      started=true;
      activeRun={id,stage:'Starting database export',file:''};
      // Keep the advisory lock/client owned by the background task after returning 202.
      const completion=build(id,key,client).finally(async()=>{activeRun=null;await client.query("SELECT pg_advisory_unlock(hashtext('bdms_backup_operation'))").catch(()=>{});client.release();});
      if(waitForCompletion)await completion;
      else void completion.catch(()=>{});
      return {id,status:'Running'};
    }catch(error){if(!started){if(locked)await client.query("SELECT pg_advisory_unlock(hashtext('bdms_backup_operation'))").catch(()=>{});client.release();}throw error;}
  }
  async function build(id,key,client){
    const temporary=await fs.mkdtemp(path.join(folder,'work-')),name=`full-backup-${id}.enc`,target=safeFile(name);
    const coverage={},manifest={format:'Caliber Pulse full recovery',version:1,createdAt:new Date().toISOString(),commit,node:process.version,coverage,files:{}};
    const zip=new yazl.ZipFile();let encrypted;
    const addFile=async(file,name)=>{manifest.files[name]={sha256:await fileHash(file),bytes:(await fs.stat(file)).size};zip.addFile(file,name,{compress:!(/\.(gz|zip|bundle|enc)$/i.test(name))});};
    const addJson=(name,value)=>{const data=Buffer.from(JSON.stringify(value,null,2));manifest.files[name]={sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length};zip.addBuffer(data,name);};
    try{
      const database=path.join(temporary,'database.ndjson.gz');
      activeRun.file=database;activeRun.stage='Exporting PostgreSQL tables';
      // Media-heavy cursor batches must not retain hundreds of large rows in memory.
      const result=await exportDatabase({client,output:database,streamRows:(connection,sql)=>streamQueryRows(connection,sql,{batchSize:8}),log:()=>{activeRun.stage='Exporting PostgreSQL tables';}});await fs.chmod(database,0o600);
      activeRun.stage='Hashing database archive';
      await addFile(database,'database.ndjson.gz');manifest.tables=result.tables;
      coverage.database={status:'Included',detail:'All public tables and sequences; compatible application schema required.'};
      coverage.media={status:'Included',detail:'Current attachments stored in database tables. Previously deleted/exported media and external storage require separate retained copies.'};
      encrypted=encryptStream(zip.outputStream,target+'.partial',key);encrypted.catch(()=>{});
      activeRun.stage='Packaging and encrypting recovery files';activeRun.file=target+'.partial';
      for(const [file,label] of [['application.bundle','gitHistory'],['application-source.zip','application']]){
        const source=path.join(root,'recovery-assets',file);
        if(await fs.stat(source).catch(()=>null)){await addFile(source,file);coverage[label]={status:'Included',detail:'Deployment recovery asset.'};}
        else coverage[label]={status:'Missing',detail:'Deployment package does not contain this recovery asset.'};
      }
      const environment=Object.fromEntries(Object.entries(env).filter(([name])=>!['IDENTITY_HEADER','MSI_SECRET','IDENTITY_ENDPOINT','MSI_ENDPOINT'].includes(name)));
      addJson('environment.json',environment);coverage.secrets={status:'Included',detail:'Encrypted running-process environment and database settings; external Key Vault values and private certificate files need separate recovery.'};
      const info=await snapshot();coverage.hosting=hostingCoverage(info);
      if(info&&await fs.stat(snapshotFile).catch(()=>null)){
        const copy=path.join(temporary,'azure-hosting.enc');await fs.copyFile(snapshotFile,copy);
        await addFile(copy,'azure-hosting.enc');coverage.pitr={status:info.pitrVerified?'Verified':'Unverified',detail:'Azure-managed PITR; snapshot contains retention/restore window. WAL files are not exported.'};
      }else coverage.pitr={status:'Unverified',detail:'Azure snapshot missing.'};
      coverage.external={status:'Review required',detail:'External DNS/provider accounts, storage objects, private certificate keys, Key Vault secrets and prior exports are not automatically included.'};
      await addFile(path.join(root,'FULL_BACKUP_RECOVERY.md'),'RECOVERY.md');
      await addFile(path.join(root,'scripts/decrypt-full-backup.mjs'),'scripts/decrypt-full-backup.mjs');
      await addFile(path.join(root,'backup-crypto.mjs'),'backup-crypto.mjs');
      coverage.recovery={status:'Included',detail:'Recovery instructions, decryption tool, hashes, version and table counts.'};
      // External dependencies cannot be asserted complete without an operator restore drill.
      const status='Partial';
      manifest.status=status;addJson('manifest.json',manifest);zip.end();const {bytes:written}=await encrypted;
      await fs.rename(target+'.partial',target);const size=(await fs.stat(target)).size;
      if(size!==written)throw Object.assign(Error(`Encrypted archive is incomplete on disk (${size} of ${written} bytes)`),{code:'ARCHIVE_INCOMPLETE'});
      const checksum=await fileHash(target);
      await pool.query("UPDATE full_backup_runs SET status=$1,file_name=$2,size_bytes=$3,checksum=$4,coverage=$5::jsonb,completed_at=NOW(),verified_bytes=$3 WHERE id=$6",[status,name,size,checksum,JSON.stringify(coverage),id]);
      await record({module:'Full Backup',action:'Finish encrypted full backup',targetType:'Recovery archive',targetReference:name,outcome:'Success',reason:`${status}; ${size} bytes checked on disk; SHA-256 ${checksum}`});
      // Cleanup problems must never turn a good backup into a failed one.
      try{
        const {plan,removed}=await housekeep();
        void tell(housekeepingMessage({title:'Pulse full backup finished',newBackup:{completedAt:new Date(),bytes:size},plan,removed,disk:await space()}));
        void tellDeleted({title:'Pulse Azure server: old backups deleted',backups:removed,plan});
      }catch(error){console.error('Full backup cleanup failed',error.code||error.name);void tell(`Pulse full backup finished (${gigabytes(size)}), but removing old backups failed: ${String(error.message||error).slice(0,200)}`);}
    }catch(error){
      zip.outputStream.destroy();if(encrypted)await encrypted.catch(()=>{});
      const failedFiles=[];
      for(const candidate of [target+'.partial',target]){const bytes=await sizeOf(candidate);if(await fs.rm(candidate,{force:true}).then(()=>true,()=>false)&&bytes)failedFiles.push({name:path.basename(candidate),bytes});}
      if(failedFiles.length)void tellDeleted({title:'Pulse Azure server: failed backup file deleted',leftovers:failedFiles});
      const incomplete=error.code==='ARCHIVE_INCOMPLETE';
      await pool.query("UPDATE full_backup_runs SET status='Failed',error_message=$2,completed_at=NOW() WHERE id=$1",[id,incomplete?'The archive on disk was shorter than written (drive full?). Removed; retry required.':'Full backup failed. Check protected server diagnostics and retry.']);
      await record({module:'Full Backup',action:'Finish encrypted full backup',targetType:'Recovery archive',targetReference:id,outcome:'Failed',reason:'Recovery archive creation failed',errorCode:error.code||error.name});
      console.error('Full backup failed',id,error.code||error.name);
      if(Date.now()-lastFailureNotice>6*3600000){lastFailureNotice=Date.now();void tell(`Pulse full backup FAILED\n${incomplete?'The file on disk was shorter than what was written (drive full?). It was removed.':`Reason: ${String(error.code||error.name||'error')}.`}\nOld backups were not touched. It retries automatically.`);}
    }finally{await fs.rm(temporary,{recursive:true,force:true});}
  }
  const wrap=fn=>async(req,res,next)=>{try{await init();await fn(req,res);}catch(error){next(error);}};
  app.get('/api/full-backups',requireSuper,requireAdministrator,wrap(async(_req,res)=>{
    await reconcileInterrupted();
    const {rows}=await pool.query('SELECT id,status,trigger_type AS "triggerType",file_name AS "fileName",size_bytes AS "sizeBytes",checksum,coverage,created_by AS "createdBy",started_at AS "startedAt",completed_at AS "completedAt",error_message AS "errorMessage" FROM full_backup_runs ORDER BY started_at DESC LIMIT 100');
    res.set('Cache-Control','no-store').json({settings:await settings(),history:rows,progress:await progress(),hosting:await snapshot(),keyConfigured:Boolean(await publicKey().catch(()=>'')),keyFingerprint:await publicKey().then(key=>createHash('sha256').update(key).digest('hex')).catch(()=>'')});
  }));
  app.put('/api/full-backups/settings',requireSuper,requireAdministrator,wrap(async(req,res)=>{
    const config=normalizeBackupSettings({...req.body,storageFolder:'full-recovery'});
    await pool.query('INSERT INTO app_settings(setting_key,setting_value,updated_at) VALUES($1,$2::jsonb,NOW()) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()',[FULL_BACKUP_KEY,JSON.stringify(config)]);
    req.audit={eventType:'Administration',module:'Full Backup',action:'Update full backup schedule',targetType:'Backup settings'};res.json({settings:config});
  }));
  app.post('/api/full-backups/run',requireSuper,requireAdministrator,wrap(async(req,res)=>{
    if(!scheduledJobsEnabled)return res.status(409).json({error:'Full backups run only in production.'});
    const result=await run({actor:req.session?.login||'Administrator'});req.audit={eventType:'Administration',module:'Full Backup',action:'Create encrypted full backup',targetReference:result.id};res.status(202).json(result);
  }));
  const download=wrap(async(req,res)=>{
    const {rows}=await pool.query("SELECT file_name,checksum FROM full_backup_runs WHERE id=$1 AND status IN ('Completed','Partial')",[req.params.id]);
    if(!rows[0]?.file_name)return res.status(404).json({error:'Recovery file unavailable'});
    res.set({'Cache-Control':'no-store, no-transform','X-Checksum-SHA256':rows[0].checksum});res.download(safeFile(rows[0].file_name));
  });
  app.get('/api/full-backups/:id/download',requireSuper,requireAdministrator,download);
  const service=(req,res,next)=>{if(!scheduledJobsEnabled||!validServiceKey(env.FULL_BACKUP_SERVICE_KEY,String(req.headers['x-full-backup-key']||'')))return res.status(403).json({error:'Backup service access denied'});next();};
  app.post('/api/full-backup-system/snapshot',service,wrap(async(req,res)=>{
    const {archive,summary}=req.body||{};if(typeof archive!=='string'||archive.length>24*1024*1024||!summary||!Number.isFinite(Date.parse(summary.capturedAt)))return res.status(400).json({error:'Invalid snapshot'});
    const content=Buffer.from(archive,'base64');const header=JSON.parse(content.subarray(0,content.indexOf(10)).toString());
    const keyId=createHash('sha256').update(await publicKey()).digest('hex');if(header.format!=='Caliber Pulse encrypted recovery'||header.keyId!==keyId)return res.status(400).json({error:'Snapshot recovery key mismatch'});
    await fs.writeFile(snapshotFile+'.tmp',content,{mode:0o600});await fs.rename(snapshotFile+'.tmp',snapshotFile);
    await fs.writeFile(snapshotInfo,JSON.stringify({capturedAt:summary.capturedAt,complete:summary.complete===true,pitrVerified:summary.pitrVerified===true,summary:String(summary.summary||'').slice(0,500),resources:Number(summary.resources)||0,pitr:summary.pitr||[]} ),{mode:0o600});res.json({stored:true});
  }));
  app.post('/api/full-backup-system/run',service,wrap(async(_req,res)=>res.status(202).json(await run({trigger:'Azure collector',actor:'GitHub OIDC collector'}))));
  app.get('/api/full-backup-system/status',service,wrap(async(_req,res)=>{await reconcileInterrupted();const {rows}=await pool.query('SELECT id,status,file_name AS "fileName",checksum,started_at AS "startedAt" FROM full_backup_runs ORDER BY started_at DESC LIMIT 1');res.set('Cache-Control','no-store').json({...rows[0],progress:await progress()});}));
  app.get('/api/full-backup-system/:id/download',service,download);
  let completedSlot=null;
  async function tick(){
    if(!isReady()||!scheduledJobsEnabled||activeRun)return;
    if(!housekeptAtStart){await init();housekeptAtStart=await housekeepAtStart();}
    const now=new Date(),slot=indiaBackupSlot(now).slotKey;
    if(completedSlot===slot||Date.now()<spaceRetryAt)return;
    await init();
    if(!scheduledBackupDue(await settings(),now))return;
    const existing=await pool.query("SELECT 1 FROM full_backup_runs WHERE slot=$1 AND status IN ('Completed','Partial')",[slot]);
    if(existing.rows.length){completedSlot=slot;return;}
    try{await run({trigger:'Scheduled',actor:'Automatic IST schedule',slot,waitForCompletion:true});}
    catch(error){if(error.code!=='FULL_BACKUP_NO_SPACE')throw error;spaceRetryAt=Date.now()+30*60000;}
  }
  const scheduledTick=()=>tick().catch(error=>console.error('Full backup schedule check failed',error.code||error.name));
  const timer=setInterval(()=>enqueue(scheduledTick),60000);timer.unref?.();
  return {run,tick,progress,housekeep};
}
