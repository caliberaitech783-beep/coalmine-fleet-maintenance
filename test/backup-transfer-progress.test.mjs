import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {responseTotalBytes,transferPercent,transferLabel,trackedBody} from '../src/transfer-progress.mjs';

const client=readFileSync(new URL('../src/backup-administration.jsx',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const css=readFileSync(new URL('../src/backup-administration.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');

test('percent is whole, capped at 99 until the last byte, and unknown without a size',()=>{
  assert.equal(transferPercent(0,1000),0);
  assert.equal(transferPercent(505,1000),50);
  assert.equal(transferPercent(999,1000),99,'never shows 100 before the last byte');
  assert.equal(transferPercent(1000,1000),100);
  assert.equal(transferPercent(1200,1000),100);
  assert.equal(transferPercent(10,0),null);
  assert.equal(transferLabel(5,10,value=>`${value}B`),'5B of 10B');
  assert.equal(transferLabel(5,0,value=>`${value}B`),'5B');
  assert.equal(responseTotalBytes({headers:{get:()=> '2048'}}),2048);
  assert.equal(responseTotalBytes({headers:{get:()=>null}}),0);
});

test('the tracked body passes every byte through and reports progress to the end',async()=>{
  const chunks=[new Uint8Array(300),new Uint8Array(700)];
  const body=new ReadableStream({start(controller){chunks.forEach(chunk=>controller.enqueue(chunk));controller.close();}});
  const response={headers:{get:()=> '1000'},body};
  const seen=[];
  const out=await new Response(trackedBody(response,(loaded,total)=>seen.push([loaded,total]))).arrayBuffer();
  assert.equal(out.byteLength,1000);
  assert.deepEqual(seen,[[0,1000],[300,1000],[1000,1000],[1000,1000]]);
});

test('export and stored downloads show preparing, a real percentage, then saved',()=>{
  assert.match(client,/setTransfer\(\{label:'Export backup',phase:'preparing',loaded:0,total:0,startedAt\}\);\s*const response=await fetch\('\/api\/backups\/export'/);
  assert.match(client,/if\(handle\)\{const writable=await handle\.createWritable\(\);await trackedBody\(response,onProgress\)\.pipeTo\(writable\);\}/);
  assert.match(client,/await saveResponseToComputer\(response,row\.fileName,\(loaded,total\)=>setTransfer\(/);
  assert.match(client,/<TransferProgress progress=\{transfer\} \/>/);
  assert.match(client,/role="progressbar" aria-label=\{progress\.label\} aria-valuemin=\{0\} aria-valuemax=\{100\}/);
  assert.match(client,/Choose location and export/,'button text unchanged');
  assert.match(css,/\.backup-transfer-fill\{[^}]*transition:width \.3s ease;/);
  assert.match(css,/\.backup-transfer-preparing \.backup-transfer-fill\{width:35%;animation:backup-transfer-sweep/);
  assert.match(css,/\.backup-transfer-done \.backup-transfer-fill\{width:100%;/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
});
