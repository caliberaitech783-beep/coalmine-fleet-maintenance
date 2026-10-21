import yazl from 'yazl';
import yauzl from 'yauzl';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';

export const MEDIA_FIELDS=['opening_meter_file','closing_meter_file','first_trip_card_image','complaint_audio','maintenance_audio'];
const NAME_FIELDS={opening_meter_file:'opening_meter_file_name',closing_meter_file:'closing_meter_file_name'};
const FORMAT='Caliber Pulse selective request media';
const maxFile=25*1024*1024;
const fail=message=>Object.assign(new Error(message),{status:400});
export function mediaCutoff(day){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(day)))throw fail('Choose a valid exclusive MIS verification cutoff date.');
  const date=new Date(`${day}T00:00:00+05:30`);
  if(!Number.isFinite(+date)||new Date(+date+19800000).toISOString().slice(0,10)!==day)throw fail('Invalid cutoff date.');
  return date.toISOString();
}
const mediaWhere=MEDIA_FIELDS.map(field=>`${field}<>''`).join(' OR ');
export async function previewMediaBackup(pool,day){
  const cutoff=mediaCutoff(day);
  const {rows:[row]}=await pool.query(`SELECT COUNT(*)::int AS requests,
    COALESCE(SUM(${MEDIA_FIELDS.map(field=>`octet_length(${field})`).join('+')}),0)::bigint AS bytes
    FROM maintenance_requests WHERE verified_at IS NOT NULL AND verified_at<$1 AND (${mediaWhere})`,[cutoff]);
  return {cutoff,cutoffDay:day,requests:row.requests,storedBytes:Number(row.bytes)};
}
export function decodeMedia(value,field){
  const match=String(value).match(/^data:([a-z0-9.+/-]+)(?:;codecs=[^;,]+)?;base64,([A-Za-z0-9+/]*={0,2})$/i);
  if(!match||!match[2]||match[2].length%4)throw fail(`Invalid stored media in ${field}. Export stopped; nothing was changed.`);
  const type=match[1].toLowerCase();
  if(field.endsWith('audio')?!type.startsWith('audio/'):!type.startsWith('image/')&&type!=='application/pdf')throw fail('Unexpected media type.');
  const bytes=Buffer.from(match[2],'base64');
  if(bytes.length>maxFile||bytes.toString('base64')!==match[2])throw fail('Unsupported stored media size or encoding.');
  const extension=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf','audio/webm':'webm','audio/ogg':'ogg','audio/mp4':'m4a','audio/mpeg':'mp3','audio/wav':'wav'})[type]||'bin';
  return {bytes,type,extension,prefix:value.slice(0,value.indexOf(',')+1)};
}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

// A repeatable snapshot and one stream at a time keep large exports bounded.
// No backup archive is persisted on Azure during export.
export async function exportMediaBackup(pool,day,destination){
  const client=await pool.connect(),zip=new yazl.ZipFile();
  const manifest={format:FORMAT,version:1,cutoff:mediaCutoff(day),cutoffDay:day,createdAt:new Date().toISOString(),entries:[]};
  const completion=pipeline(zip.outputStream,destination);
  completion.catch(()=>{});
  zip.on('error',error=>zip.outputStream.destroy(error));
  try{
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query(`DECLARE media_backup_cursor NO SCROLL CURSOR FOR SELECT id,reference,verified_at,${MEDIA_FIELDS.join(',')},opening_meter_file_name,closing_meter_file_name
      FROM maintenance_requests WHERE verified_at IS NOT NULL AND verified_at<$1 AND (${mediaWhere}) ORDER BY id`,[manifest.cutoff]);
    while(true){
      if(destination.destroyed)throw new Error('Backup download disconnected.');
      const {rows}=await client.query('FETCH FORWARD 1 FROM media_backup_cursor');
      if(!rows.length)break;
      const row=rows[0];
      for(const field of MEDIA_FIELDS){
        if(!row[field])continue;
        const {bytes,type,extension,prefix}=decodeMedia(row[field],field);
        const entry={path:`requests/${row.id}/${field}.${extension}`,requestId:String(row.id),reference:row.reference,verifiedAt:new Date(row.verified_at).toISOString(),field,type,prefix,name:NAME_FIELDS[field]?row[NAME_FIELDS[field]]:'',bytes:bytes.length,sha256:hash(bytes)};
        manifest.entries.push(entry);
        const stream=Readable.from([bytes]);
        const consumed=new Promise((resolve,reject)=>{stream.once('end',resolve);stream.once('error',reject);zip.outputStream.once('error',reject);stream.once('end',()=>zip.outputStream.removeListener('error',reject));});
        zip.addReadStream(stream,entry.path,{compress:false,size:bytes.length});
        await consumed;
      }
    }
    zip.addBuffer(Buffer.from(JSON.stringify(manifest,null,2)),'manifest.json');
    zip.addBuffer(Buffer.from('Caliber Pulse selective media backup\n\nOriginal trip cards (including PDF evidence) and complaint/maintenance audio.\nmanifest.json maps each file to its request, verification date, field, original filename and SHA-256.\nRestore through Admin > Database > Storage management > Selective media backup and restore.\nRestore fills missing fields only. Conflicting media is never overwritten.\nKeep this entire ZIP intact. No requests or media were deleted by export.\n'),'README.txt');
    zip.end({forceZip64Format:true});
    await completion;
    await client.query('COMMIT');
    return {files:manifest.entries.length,requests:new Set(manifest.entries.map(entry=>entry.requestId)).size};
  }catch(error){zip.outputStream.destroy(error);await completion.catch(()=>{});await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{client.release();}
}

// Read entry data without extracting paths to disk, blocking zip bombs and
// validating checksums before any restore writes are committed.
export async function scanMediaZip(file,onMedia=async()=>{}){
  const zip=await new Promise((resolve,reject)=>yauzl.open(file,{lazyEntries:true,validateEntrySizes:true},(error,result)=>error?reject(error):resolve(result)));
  const found=new Map();let manifest;
  try{
    await new Promise((resolve,reject)=>{
      zip.once('error',reject);zip.once('end',resolve);
      zip.on('entry',entry=>{(async()=>{
        if(found.has(entry.fileName)||entry.uncompressedSize>maxFile||entry.generalPurposeBitFlag&1)throw fail('Duplicate, oversized or encrypted ZIP entry.');
        if(!/^(manifest\.json|README\.txt|requests\/\d+\/(opening_meter_file|closing_meter_file|first_trip_card_image|complaint_audio|maintenance_audio)\.[a-z0-9]+)$/.test(entry.fileName))throw fail('Unrecognized media ZIP entry.');
        const stream=await new Promise((yes,no)=>zip.openReadStream(entry,(error,result)=>error?no(error):yes(result)));
        const chunks=[];let size=0;
        for await(const chunk of stream){size+=chunk.length;if(size>maxFile)throw fail('ZIP entry exceeds the safe size limit.');chunks.push(chunk);}
        const bytes=Buffer.concat(chunks);
        if(found.size>=250000)throw fail('Too many ZIP entries.');
        found.set(entry.fileName,{bytes:size,sha256:hash(bytes)});
        if(entry.fileName==='manifest.json')manifest=JSON.parse(bytes.toString());
        else if(entry.fileName!=='README.txt')await onMedia(entry.fileName,bytes);
        zip.readEntry();
      })().catch(reject);});zip.readEntry();
    });
    if(manifest?.format!==FORMAT||manifest.version!==1||!Array.isArray(manifest.entries)||manifest.entries.length>250000)throw fail('Not a supported selective media backup.');
    if(mediaCutoff(manifest.cutoffDay)!==manifest.cutoff)throw fail('Backup cutoff is invalid.');
    const paths=new Set();
    for(const entry of manifest.entries){
      const actual=found.get(entry.path);
      if(paths.has(entry.path)||!MEDIA_FIELDS.includes(entry.field)||!/^\d+$/.test(entry.requestId)||!entry.path.startsWith(`requests/${entry.requestId}/${entry.field}.`)||typeof entry.reference!=='string'||typeof entry.name!=='string'||entry.name.length>255||!(new Date(entry.verifiedAt)<new Date(manifest.cutoff))||!actual||actual.sha256!==entry.sha256||actual.bytes!==entry.bytes)throw fail('Backup manifest, scope or checksum validation failed.');
      if(entry.prefix!==`data:${entry.type};base64,`&&!new RegExp(`^data:${entry.type.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')};codecs=[^;,]+;base64,$`).test(entry.prefix))throw fail('Invalid media encoding metadata.');
      if(entry.field.endsWith('audio')?!/^audio\/[a-z0-9.+-]+$/.test(entry.type):!/^image\/[a-z0-9.+-]+$/.test(entry.type)&&entry.type!=='application/pdf')throw fail('Invalid media type.');
      paths.add(entry.path);
    }
    if([...found.keys()].some(path=>path!=='manifest.json'&&path!=='README.txt'&&!paths.has(path)))throw fail('ZIP has unlisted media.');
    return manifest;
  }finally{zip.close();}
}
export async function restoreMediaBackup(pool,file){
  const manifest=await scanMediaZip(file),entries=new Map(manifest.entries.map(entry=>[entry.path,entry]));
  const client=await pool.connect();let restored=0,unchanged=0;
  try{
    await client.query('BEGIN');
    // This operation restores media only, including on archived requests.
    await client.query("SELECT set_config('bdms.archive_operation','restore',true)");
    await scanMediaZip(file,async(path,bytes)=>{
      const entry=entries.get(path);if(!entry||hash(bytes)!==entry.sha256)throw fail('Archive changed after inspection.');
      const {rows:[row]}=await client.query(`SELECT reference,verified_at,${entry.field} AS value FROM maintenance_requests WHERE id=$1 FOR UPDATE`,[entry.requestId]);
      if(!row||row.reference!==entry.reference||!row.verified_at||new Date(row.verified_at).toISOString()!==entry.verifiedAt)throw fail(`Request ${entry.reference} is missing or its verification changed. Nothing was restored.`);
      const value=entry.prefix+bytes.toString('base64');
      if(row.value===value){unchanged++;return;}
      if(row.value)throw fail(`Request ${entry.reference} already has different media. Nothing was restored.`);
      const nameField=NAME_FIELDS[entry.field];
      await client.query(`UPDATE maintenance_requests SET ${entry.field}=$2${nameField?`,${nameField}=$3`:''} WHERE id=$1`,nameField?[entry.requestId,value,entry.name]:[entry.requestId,value]);restored++;
    });
    await client.query('COMMIT');return {restored,unchanged};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
