import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import http from 'node:http';
import {downloadRecoveryArchive} from '../scripts/download-recovery-archive.mjs';

// A local stand-in for the production download route behind Front Door.
async function rangeServer(data,answer){
 const server=http.createServer((req,res)=>{
  if(req.method==='HEAD'){res.writeHead(200,{'Content-Length':String(data.length)}).end();return;}
  const [,a,b]=/bytes=(\d+)-(\d+)/.exec(req.headers.range),start=Number(a),end=Number(b);
  answer({req,res,start,end,headers:{'Content-Range':`bytes ${start}-${end}/${data.length}`,'Content-Length':String(end-start+1)},body:data.subarray(start,end+1)});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {url:`http://127.0.0.1:${server.address().port}/download`,close:()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));}};
}

test('range recovery copy retries reads and verifies the entire file before publishing',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'recovery-transfer-'));
 const data=Buffer.from('Immutable encrypted recovery archive '.repeat(2000));
 const checksum=createHash('sha256').update(data).digest('hex');let retried=false;
 const fetchImpl=async(_url,options)=>{
  assert.equal(options.headers.get('accept-encoding'),'identity');
  assert.equal(options.headers.get('x-full-backup-key'),'fixture');
  if(options.method==='HEAD')return new Response(null,{headers:{'content-length':String(data.length)}});
  const [,a,b]=options.headers.get('range').match(/bytes=(\d+)-(\d+)/),start=Number(a),end=Number(b);
  if(start===0&&!retried){retried=true;return new Response(null,{status:503});}
  return new Response(data.subarray(start,end+1),{status:206,headers:{'content-range':`bytes ${start}-${end}/${data.length}`}});
 };
 try{
  const target=path.join(folder,'archive.enc');
  const headers={'x-full-backup-key':'fixture','Accept-Encoding':'gzip'};
  await downloadRecoveryArchive({url:'https://example.invalid',headers,target,checksum,chunkBytes:4096,fetchImpl});
  assert.equal(retried,true);assert.deepEqual(await readFile(target),data);
  await assert.rejects(downloadRecoveryArchive({url:'https://example.invalid',headers,target,checksum,chunkBytes:4096,fetchImpl}),{code:'EEXIST'});
  assert.deepEqual(await readFile(target),data);
  await assert.rejects(downloadRecoveryArchive({url:'https://example.invalid',headers,target:path.join(folder,'bad.enc'),checksum:'0'.repeat(64),chunkBytes:4096,fetchImpl}),/checksum mismatch/);
  assert.deepEqual(await readdir(folder),['archive.enc']);
 }finally{await rm(folder,{recursive:true,force:true});}
});

test('range recovery copy refuses a full-body fallback and leaves no completed file',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'recovery-transfer-'));
 try{
  const fetchImpl=async(_url,options)=>options.method==='HEAD'?new Response(null,{headers:{'content-length':'100'}}):new Response('wrong response');
  await assert.rejects(downloadRecoveryArchive({url:'https://example.invalid',target:path.join(folder,'archive.enc'),checksum:'0'.repeat(64),fetchImpl}),/range response/);
  assert.deepEqual(await readdir(folder),[]);
 }finally{await rm(folder,{recursive:true,force:true});}
});

// 16, 17 and 23 November 2026: Front Door closed the connection after a range
// while earlier bytes were still being written, and Node's built-in fetch
// stopped the whole collector with assert(!this.paused).
test('range recovery copy completes when the server closes the connection after every range',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'recovery-transfer-'));
 const block=randomBytes(1024*1024),data=Buffer.concat(Array.from({length:48},()=>block));
 const checksum=createHash('sha256').update(data).digest('hex');let closed=0;
 const server=await rangeServer(data,({res,headers,body})=>{closed+=1;res.writeHead(206,{...headers,Connection:'close'});res.end(body);});
 try{
  const target=path.join(folder,'archive.enc');
  assert.deepEqual(await downloadRecoveryArchive({url:server.url,headers:{'x-full-backup-key':'fixture'},target,checksum}),{bytes:data.length,checksum});
  assert.equal(closed,6);assert.equal(createHash('sha256').update(await readFile(target)).digest('hex'),checksum);
  assert.deepEqual(await readdir(folder),['archive.enc']);
 }finally{await server.close();await rm(folder,{recursive:true,force:true});}
});

test('range recovery copy retries a range whose connection drops part way',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'recovery-transfer-'));
 const data=randomBytes(4*1024*1024),checksum=createHash('sha256').update(data).digest('hex');let dropped=0;
 const server=await rangeServer(data,({req,res,start,headers,body})=>{
  assert.equal(req.headers['x-full-backup-key'],'fixture');assert.equal(req.headers['accept-encoding'],'identity');
  if(start===0&&!dropped){dropped+=1;res.writeHead(206,headers);res.write(body.subarray(0,body.length/2),()=>res.destroy());return;}
  res.writeHead(206,headers);res.end(body);
 });
 try{
  const target=path.join(folder,'archive.enc');
  await downloadRecoveryArchive({url:server.url,headers:{'x-full-backup-key':'fixture'},target,checksum,chunkBytes:1024*1024});
  assert.equal(dropped,1);assert.deepEqual(await readFile(target),data);
  assert.deepEqual(await readdir(folder),['archive.enc']);
 }finally{await server.close();await rm(folder,{recursive:true,force:true});}
});

// 12, 13 and 22 November 2026: the site refused the small inventory upload and
// the run ended without saying why and without the day's off-site archive copy.
test('a refused inventory upload states the reason, still copies the archive and never retains a part copy',async()=>{
 const collector=await readFile(new URL('../scripts/collect-azure-recovery.mjs',import.meta.url),'utf8');
 assert.match(collector,/upload to production failed\. Last answer: /);
 assert.match(collector,/if\(process\.env\.CREATE_FULL_BACKUP==='true'\)throw failure;/);
 assert.match(collector,/console\.error\(failure\.message\);process\.exitCode=1;/);
 assert.doesNotMatch(collector,/console\.(log|error)\([^)]*serviceKey/);
 assert.match(collector,/process\.on\('exit',[^\n]*name\.endsWith\('\.partial'\)\)rmSync\(/);
});
