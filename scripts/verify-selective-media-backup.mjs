import {scanMediaZip} from '../selective-media-backup.mjs';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
const file=process.argv[2];
if(!file){console.error('Usage: node scripts/verify-selective-media-backup.mjs path/to/backup.zip');process.exit(1);}
try{
  const manifest=await scanMediaZip(file);
  const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);
  const cards=manifest.entries.filter(entry=>!entry.field.endsWith('audio'));
  const audio=manifest.entries.filter(entry=>entry.field.endsWith('audio'));
  console.log(JSON.stringify({valid:true,cutoffDay:manifest.cutoffDay,timezone:'Asia/Kolkata',requests:new Set(manifest.entries.map(entry=>entry.requestId)).size,tripCards:cards.length,audioFiles:audio.length,mediaBytes:manifest.entries.reduce((sum,entry)=>sum+entry.bytes,0),sha256:hash.digest('hex')},null,2));
}catch(error){console.error('Backup verification failed:',error.message);process.exit(1);}
