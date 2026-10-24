import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {downloadRecoveryArchive} from '../scripts/download-recovery-archive.mjs';

test('range recovery copy retries reads and verifies the entire file before publishing',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'recovery-transfer-'));
 const data=Buffer.from('Immutable encrypted recovery archive '.repeat(2000));
 const checksum=createHash('sha256').update(data).digest('hex');let retried=false;
 const fetchImpl=async(_url,options)=>{
  if(options.method==='HEAD')return new Response(null,{headers:{'content-length':String(data.length)}});
  const [,a,b]=options.headers.Range.match(/bytes=(\d+)-(\d+)/),start=Number(a),end=Number(b);
  if(start===0&&!retried){retried=true;return new Response(null,{status:503});}
  return new Response(data.subarray(start,end+1),{status:206,headers:{'content-range':`bytes ${start}-${end}/${data.length}`}});
 };
 try{
  const target=path.join(folder,'archive.enc');
  await downloadRecoveryArchive({url:'https://example.invalid',target,checksum,chunkBytes:4096,fetchImpl});
  assert.equal(retried,true);assert.deepEqual(await readFile(target),data);
  await assert.rejects(downloadRecoveryArchive({url:'https://example.invalid',target,checksum,chunkBytes:4096,fetchImpl}),{code:'EEXIST'});
  assert.deepEqual(await readFile(target),data);
  await assert.rejects(downloadRecoveryArchive({url:'https://example.invalid',target:path.join(folder,'bad.enc'),checksum:'0'.repeat(64),chunkBytes:4096,fetchImpl}),/checksum mismatch/);
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
