import {open,link,rm} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';

// Bounded range downloads keep large media archives off heap and retry only
// immutable reads. Never publish a truncated or unauthenticated checksum copy.
export async function downloadRecoveryArchive({url,headers={},target,checksum,concurrency=4,chunkBytes=16*1024*1024,fetchImpl=fetch}){
  if(!/^[a-f0-9]{64}$/.test(checksum||''))throw Error('Expected recovery checksum is required');
  const head=await fetchImpl(url,{method:'HEAD',headers,signal:AbortSignal.timeout(60000)});
  const size=Number(head.headers.get('content-length'));
  if(!head.ok||!Number.isSafeInteger(size)||size<1)throw Error('Recovery archive size unavailable');
  const partial=target+'.partial',file=await open(partial,'wx',0o600);
  let next=0;
  try{
    await file.truncate(size);await file.close();
    async function worker(){
      while(next<size){
        const start=next,end=Math.min(size-1,start+chunkBytes-1);next=end+1;
        for(let attempt=0;attempt<3;attempt++){
          try{
            const response=await fetchImpl(url,{headers:{...headers,Range:`bytes=${start}-${end}`},signal:AbortSignal.timeout(300000)});
            if(response.status!==206||response.headers.get('content-range')!==`bytes ${start}-${end}/${size}`){await response.body?.cancel();throw Error('Recovery range response is invalid');}
            let bytes=0;
            const bounded=new Transform({transform(chunk,_encoding,callback){bytes+=chunk.length;callback(bytes>end-start+1?Error('Recovery range exceeded expected size'):null,chunk);}});
            await pipeline(Readable.fromWeb(response.body),bounded,createWriteStream(partial,{flags:'r+',start}));
            if(bytes!==end-start+1)throw Error('Recovery range was truncated');
            break;
          }catch(error){if(attempt===2){next=size;throw error;}}
        }
      }
    }
    const results=await Promise.allSettled(Array.from({length:Math.min(8,Math.max(1,concurrency))},worker));
    const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;
    const hash=createHash('sha256');for await(const chunk of createReadStream(partial))hash.update(chunk);
    if(hash.digest('hex')!==checksum)throw Error('Downloaded recovery checksum mismatch');
    // Link publishes the completed file atomically and refuses existing output.
    await link(partial,target);await rm(partial);return {bytes:size,checksum};
  }catch(error){await file.close().catch(()=>{});await rm(partial,{force:true});throw error;}
}
