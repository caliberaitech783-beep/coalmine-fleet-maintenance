// Keys that let a scheduled task on a PC copy the latest backup without a
// user session. A key is shown once when created; only its SHA-256 hash is
// stored, it can be revoked at any time and it grants nothing except
// downloading the latest completed backup.
import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';

export const PC_BACKUP_KEY_SETTING='pc_backup_keys';
export const PC_BACKUP_KEY_PREFIX='ncbk_';
export const PC_BACKUP_KEY_LIMIT=10;

const text=(value)=>String(value??'').trim();
export const hashPcBackupKey=(key)=>createHash('sha256').update(String(key??'')).digest('hex');
export const cleanPcBackupLabel=(label)=>text(label).replace(/[\u0000-\u001f<>]/g,'').slice(0,60)||'Backup PC';

export function normalizePcBackupKeys(value){
  const list=Array.isArray(value?.keys)?value.keys:[];
  return list.filter((record)=>record&&text(record.id)&&/^[0-9a-f]{64}$/.test(String(record.hash||''))).slice(0,PC_BACKUP_KEY_LIMIT).map((record)=>({
    id:text(record.id),label:cleanPcBackupLabel(record.label),hash:String(record.hash),hint:text(record.hint).slice(0,8),
    createdAt:text(record.createdAt)||null,createdBy:text(record.createdBy).slice(0,120),
    lastUsedAt:text(record.lastUsedAt)||null,lastUsedIp:text(record.lastUsedIp).slice(0,64),
  }));
}

export function createPcBackupKey({label,createdBy='',now=new Date(),random=randomBytes,makeId=randomUUID}={}){
  const key=PC_BACKUP_KEY_PREFIX+Buffer.from(random(32)).toString('base64url');
  return {key,record:{id:makeId(),label:cleanPcBackupLabel(label),hash:hashPcBackupKey(key),hint:key.slice(-4),
    createdAt:now.toISOString(),createdBy:text(createdBy).slice(0,120),lastUsedAt:null,lastUsedIp:''}};
}

/** The stored record for a presented key (constant-time compare), or null. */
export function matchPcBackupKey(records,presented){
  const key=text(presented);
  if(!key.startsWith(PC_BACKUP_KEY_PREFIX)||key.length<24||key.length>200)return null;
  const digest=Buffer.from(hashPcBackupKey(key),'hex');
  for(const record of records||[]){
    const stored=Buffer.from(String(record.hash||''),'hex');
    if(stored.length===digest.length&&timingSafeEqual(stored,digest))return record;
  }
  return null;
}

export const publicPcBackupKeys=(records)=>(records||[]).map(({hash,...rest})=>rest);

/** Simple fixed-window limiter per address for the keyed download. */
export function createAttemptLimiter({limit=30,windowMs=3600000}={}){
  const seen=new Map();
  return (address,now=Date.now())=>{
    const id=text(address)||'unknown';
    const entry=seen.get(id);
    if(!entry||now-entry.start>windowMs){seen.set(id,{start:now,count:1});return false;}
    entry.count+=1;
    return entry.count>limit;
  };
}
