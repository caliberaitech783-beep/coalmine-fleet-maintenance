import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateKeyPairSync,createVerify} from 'node:crypto';
import {normalizePem,printHelperSigning,signPrintRequest,PRINT_HELPER_MAX_REQUEST_LENGTH} from '../print-helper-signing.mjs';
import {directPrintPaper,directPrintOptions,blobToBase64,rememberedPrinter,rememberPrinter,printHelperAvailable} from '../src/direct-print.mjs';
import {PRINT_PAGE_SIZES} from '../src/smart-print.mjs';

const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const server=read('../server.mjs'),main=read('../src/main.jsx'),client=read('../src/direct-print.mjs');
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});

test('the chosen Smart Print page becomes the printer paper size',()=>{
  const [a4,a3]=PRINT_PAGE_SIZES;
  assert.deepEqual(directPrintPaper(a4),{size:{width:210,height:297},units:'mm'},'A4, given to the helper as portrait millimetres');
  assert.deepEqual(directPrintPaper(a3),{size:{width:297,height:420},units:'mm'},'A3');
  assert.throws(()=>directPrintPaper({}),/valid page size/);
  const options=directPrintOptions(a3,'  BD Balance ·  All regions ');
  assert.deepEqual(options,{size:{width:297,height:420},units:'mm',scaleContent:true,colorType:'color',jobName:'BD Balance · All regions'});
  assert.equal(directPrintOptions(a4,'').jobName,'Nerve Center report');
});

test('PDF bytes are passed to the helper as base64, including large files',async()=>{
  assert.equal(await blobToBase64(new Blob([new Uint8Array([37,80,68,70])])),'JVBERg==');
  const big=new Uint8Array(200_000).fill(65);
  assert.equal(Buffer.from(await blobToBase64(new Blob([big])),'base64').length,200_000);
});

test('the printer used last is remembered on this PC',()=>{
  const values=new Map(),storage={getItem:(key)=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:(key)=>values.delete(key)};
  assert.equal(rememberedPrinter(storage),'');
  rememberPrinter('iR C3326',storage);
  assert.equal(rememberedPrinter(storage),'iR C3326');
  rememberPrinter('',storage);
  assert.equal(rememberedPrinter(storage),'');
  assert.equal(rememberedPrinter({getItem(){throw new Error('blocked')}}),'','blocked storage never breaks printing');
});

test('without the helper the check answers false quickly and is remembered for a minute',async()=>{
  let loads=0;
  const connected={websocket:{isActive:()=>true}};
  const slow={websocket:{isActive:()=>false,connect:()=>new Promise(()=>{})}};
  const base=Date.now()+10*60_000;
  assert.equal(await printHelperAvailable({now:base,load:async()=>{loads++;return connected}}),true,'an active helper connection is used');
  assert.equal(await printHelperAvailable({now:base+1,timeoutMs:50,load:async()=>{loads++;return slow}}),false,'a helper that never answers times out');
  assert.equal(await printHelperAvailable({now:base+30_000,load:async()=>{loads++;return connected}}),false,'within the minute the miss is answered from memory');
  assert.equal(loads,2);
  assert.equal(await printHelperAvailable({now:base+61_001,load:async()=>{loads++;throw new Error('not installed')}}),false);
  assert.equal(await printHelperAvailable({now:base+200_000,load:async()=>{loads++;return connected}}),true,'and it is tried again afterwards');
});

test('print requests are signed with SHA512-RSA and the key accepts the formats an app setting can hold',()=>{
  const signature=signPrintRequest('abc123',privateKey);
  assert.equal(createVerify('RSA-SHA512').update('abc123').verify(publicKey,signature,'base64'),true);
  assert.throws(()=>signPrintRequest('',privateKey),/valid print request/);
  assert.throws(()=>signPrintRequest('x'.repeat(PRINT_HELPER_MAX_REQUEST_LENGTH+1),privateKey),/valid print request/);
  assert.throws(()=>signPrintRequest('abc',''),/not configured/);
  const oneLine=privateKey.trim().replace(/\n/g,'\\n'),encoded=Buffer.from(privateKey).toString('base64');
  for(const stored of [privateKey,oneLine,encoded,privateKey.replace(/\n/g,'\r\n')])assert.equal(normalizePem(stored),privateKey,'every stored form gives the same PEM');
  assert.equal(normalizePem(''),'');
  assert.equal(normalizePem('not a key'),'');
  assert.deepEqual(printHelperSigning({}),{certificate:'',privateKey:'',configured:false});
  assert.equal(printHelperSigning({QZ_SIGNING_CERTIFICATE:publicKey,QZ_SIGNING_PRIVATE_KEY:oneLine}).configured,true);
  assert.equal(printHelperSigning({QZ_SIGNING_CERTIFICATE:publicKey}).configured,false,'both parts are required');
});

test('the server only ever hands out the public certificate and signatures, to signed-in users',()=>{
  assert.match(server,/app\.get\('\/api\/print-helper\/certificate',requireSession,/);
  assert.match(server,/app\.post\('\/api\/print-helper\/sign',requireSession,/);
  assert.match(server,/if\(!configured\)return res\.status\(204\)\.end\(\);/,'inert until the signing settings exist');
  assert.match(server,/res\.json\(\{signature:signPrintRequest\(req\.body\?\.request,privateKey\)\}\)/);
  assert.doesNotMatch(server,/res\.(?:json|send)\([^)]*privateKey[^)]*\)(?!\}\))/,'the private key is never sent');
  assert.doesNotMatch(client,/PRIVATE KEY|privateKey/,'the browser never sees the key');
});

test('Smart Print prints through the helper and falls back to the browser print window',()=>{
  assert.match(main,/function printTableReport\(report\) \{\n  void printReportDirect\(report\)\.then\(\(sent\) => \{ if \(!sent\) printTableReportInBrowser\(report\); \}\);\n\}/);
  assert.match(main,/if \(!\(await printHelperAvailable\(\{ token: \(\) => authToken \}\)\)\) return false;/);
  assert.match(main,/highlights, pageSize: page\.name \}\),/,'the PDF is built at the chosen A3 / A4 size');
  assert.match(main,/await printPdfDirect\(\{ pdf: await response\.blob\(\), page, jobName: title, token: \(\) => authToken \}\)/);
  assert.match(main,/catch \(error\) \{\n    console\.warn\("Direct printing was not possible; using the browser print window\.", error\);\n    return false;/);
  assert.match(client,/import\('qz-tray'\)/,'the helper library is loaded only when printing');
  assert.match(client,/qz\.print\(config,\[\{type:'pixel',format:'pdf',flavor:'base64',data\}\]\)/);
  assert.match(client,/if\(!remembered\)return send\(await qz\.printers\.getDefault\(\)\);/,'the default printer is looked up only until a printer is remembered');
  assert.match(client,/rememberPrinter\(''\);\n    return send\(await qz\.printers\.getDefault\(\)\);/,'a removed printer falls back to the current default');
  assert.match(client,/qz\.security\.setSignatureAlgorithm\('SHA512'\);/);
});
