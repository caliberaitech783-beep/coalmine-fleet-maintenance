import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateKeyPairSync,createVerify} from 'node:crypto';
import {X509Certificate} from 'node:crypto';
import {normalizePem,printHelperSigning,signPrintRequest,PRINT_HELPER_MAX_REQUEST_LENGTH,resolvePrintHelperSigning,certificateSummary,generatePrintHelperSigning} from '../print-helper-signing.mjs';
import {directPrintPaper,directPrintOptions,blobToBase64,rememberedPrinter,rememberPrinter,printHelperAvailable,printHelperExpected,launchPrintHelper} from '../src/direct-print.mjs';
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
  assert.match(server,/if\(!configured\)return res\.status\(204\)\.end\(\);/,'inert until a certificate exists');
  assert.match(server,/res\.json\(\{signature:signPrintRequest\(req\.body\?\.request,privateKey\)\}\)/);
  assert.doesNotMatch(server,/res\.(?:json|send)\([^)]*privateKey[^)]*\)(?!\}\))/,'the private key is never sent');
  assert.doesNotMatch(client,/PRIVATE KEY|privateKey/,'the browser never sees the key');
});

test('Smart Print prints through the helper and falls back to the browser print window',()=>{
  assert.match(main,/function printTableReport\(report\) \{\n  void printReportDirect\(report\)\.then\(\(sent\) => \{ if \(!sent\) printTableReportInBrowser\(report\); \}\);\n\}/);
  assert.match(main,/if \(!\(await printHelperAvailable\(\{ token: \(\) => authToken \}\)\)\) \{\n\s+\/\/ A PC that never used the helper[^\n]*\n\s+if \(!printHelperExpected\(\)\) return false;/,'PCs without the helper still print through the browser, silently');
  assert.match(main,/The print helper \(QZ Tray\) is not running on this PC/,'where the helper is expected, a miss is never silent');
  assert.match(main,/\? printReportDirect\(\{ title, columns, rows, highlightRow, pageSize \}\) : false;/,'OK tries again, Cancel uses the browser print window');
  assert.match(main,/if \(printHelperExpected\(\)\) alert\(`The report could not be sent through the print helper/);
  assert.match(main,/highlights, pageSize: page\.name \}\),/,'the PDF is built at the chosen A3 / A4 size');
  assert.match(main,/await printPdfDirect\(\{ pdf: await response\.blob\(\), page, jobName: title, token: \(\) => authToken \}\)/);
  assert.match(main,/catch \(error\) \{\n    console\.warn\("Direct printing was not possible; using the browser print window\.", error\);\n    if \(printHelperExpected\(\)\) alert\([^\n]+\n    return false;/,'the failure is explained, then the browser print window is used');
  assert.match(client,/import\('qz-tray'\)/,'the helper library is loaded only when printing');
  assert.match(client,/qz\.print\(config,\[\{type:'pixel',format:'pdf',flavor:'base64',data\}\]\)/);
  assert.match(client,/if\(!remembered\)return send\(await qz\.printers\.getDefault\(\)\);/,'the default printer is looked up only until a printer is remembered');
  assert.match(client,/rememberPrinter\(''\);\n    return send\(await qz\.printers\.getDefault\(\)\);/,'a removed printer falls back to the current default');
  assert.match(client,/qz\.security\.setSignatureAlgorithm\('SHA512'\);/);
});

test('once the helper has been used on a PC it is expected: it is started by itself and never skipped silently',async()=>{
  const values=new Map(),storage={getItem:(key)=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:(key)=>values.delete(key)};
  const connected={websocket:{isActive:()=>true}};
  assert.equal(printHelperExpected(storage),false);
  assert.equal(await printHelperAvailable({storage,now:Date.now()+3_600_000,load:async()=>connected}),true);
  assert.equal(printHelperExpected(storage),true,'a successful connection marks this PC');

  // Helper not running: it is launched, and the connection is retried until it answers.
  let launches=0,attempts=0,sleeps=0;
  const startsOnThirdTry=async()=>{attempts++;if(attempts<3)throw new Error('connection refused');return connected};
  assert.equal(await printHelperAvailable({storage,load:startsOnThirdTry,launch:()=>{launches++},sleep:async()=>{sleeps++}}),true);
  assert.deepEqual([launches,attempts,sleeps],[1,3,2],'launched once, then polled');

  // Still unreachable after the wait: false, and the next print tries again at once (no one-minute memory here).
  launches=0;attempts=0;
  const never=async()=>{attempts++;throw new Error('connection refused')};
  assert.equal(await printHelperAvailable({storage,load:never,launch:()=>{launches++},sleep:async()=>{},launchWaitMs:4500}),false);
  assert.deepEqual([launches,attempts],[1,4],'one immediate try plus three polls');
  assert.equal(await printHelperAvailable({storage,load:async()=>connected,launch:()=>{launches++}}),true,'no negative memory for an expected helper');
  assert.equal(printHelperExpected({getItem(){throw new Error('blocked')}}),false);
  assert.equal(printHelperExpected({getItem:(key)=>key==='nerveCenterDirectPrinter'?'iR C3326':null}),true,'a printer remembered from an earlier direct print also counts');
});

test('the helper is started through its qz: link in a hidden frame, leaving the app page in place',()=>{
  const added=[];
  const doc={createElement:(tag)=>({tag,style:{},remove(){}}),body:{appendChild:(node)=>added.push(node)}};
  assert.equal(launchPrintHelper(doc),true);
  assert.equal(added.length,1);
  assert.deepEqual([added[0].tag,added[0].src,added[0].style.display],['iframe','qz:launch','none']);
  assert.equal(launchPrintHelper({createElement(){throw new Error('no dom')}}),false);
});

test('the application creates and keeps its own signing pair, so nobody handles a private key',async()=>{
  const created=await generatePrintHelperSigning();
  const certificate=new X509Certificate(created.certificate);
  assert.match(certificate.subject,/CN=Nerve Center Smart Print/);
  assert.equal(certificate.ca,true,'a CA-style self-signed certificate, as QZ Tray expects for its override');
  assert.ok(new Date(certificate.validTo).getFullYear()-new Date().getFullYear()>=19,'valid for about twenty years');
  const signature=signPrintRequest('request-hash',created.privateKey);
  assert.equal(createVerify('RSA-SHA512').update('request-hash').verify(certificate.publicKey,signature,'base64'),true,'requests signed with the key verify against the certificate');

  const stored=resolvePrintHelperSigning({env:{},stored:created});
  assert.deepEqual([stored.configured,stored.source],[true,'database']);
  assert.deepEqual(resolvePrintHelperSigning({env:{},stored:{}}),{certificate:'',privateKey:'',configured:false,source:null});
  assert.equal(resolvePrintHelperSigning({env:{QZ_SIGNING_CERTIFICATE:publicKey,QZ_SIGNING_PRIVATE_KEY:privateKey},stored:created}).source,'environment','explicit server settings win');

  const summary=certificateSummary(created.certificate);
  assert.match(summary.subject,/Nerve Center Smart Print/);
  assert.match(summary.fingerprint,/^[0-9A-F:]+$/);
  assert.doesNotMatch(JSON.stringify(summary),/PRIVATE|BEGIN/,'the summary holds no key material');
  assert.deepEqual(certificateSummary('nonsense'),{subject:'',validTo:'',fingerprint:''});
  await assert.rejects(generatePrintHelperSigning({generate:async()=>({cert:'',private:''})}),/could not be created/);
});

test('the Print helper page is for administrators; the key is created once and never leaves the server',()=>{
  assert.match(server,/app\.get\('\/api\/print-helper\/setup',requireSuper,requireAdministrator,/);
  assert.match(server,/app\.post\('\/api\/print-helper\/setup',requireSuper,requireAdministrator,/);
  assert.match(server,/app\.get\('\/api\/print-helper\/setup\/override\.crt',requireSuper,requireAdministrator,/);
  assert.match(server,/if\(existing\.configured\)return res\.status\(409\)/,'an existing certificate is never replaced');
  assert.match(server,/res\.set\('Content-Disposition','attachment; filename="override\.crt"'\);/);
  const view=server.slice(server.indexOf('const printHelperSetupView='),server.indexOf("app.get('/api/print-helper/certificate'"));
  assert.doesNotMatch(view,/privateKey/,'the setup view is built without the key');
  const routes=server.slice(server.indexOf("const PRINT_HELPER_SETTING_KEY="),server.indexOf("// Audit Trail housekeeping"));
  assert.ok(routes.length>1000,'the print helper routes were found');
  assert.doesNotMatch(routes,/\.(?:json|send)\((?:created|printHelperStoredCache|existing)\)/,'stored signing material is never returned as-is');
  assert.deepEqual([...routes.matchAll(/\.(?:json|send)\(([^;]*)\);?/g)].map((match)=>match[1]).filter((sent)=>/privateKey/.test(sent)&&!/signPrintRequest\(/.test(sent)),[],'the key is only ever used to sign');
  assert.match(main,/\["People by designation", User\],\n  \["Print helper", Printer\],/);
  assert.match(main,/if\(name==="Print helper"\)return isAdministrator;/);
  assert.match(main,/active === "Print helper" \? \(\n\s+<PrintHelperSetupPage session=\{session\} \/>/);
  const page=read('../src/print-helper-setup.jsx');
  assert.match(page,/fetch\("\/api\/print-helper\/setup", \{ method: "POST"/);
  assert.match(page,/link\.download = "override\.crt";/);
  assert.match(page,/C:\\Program Files\\QZ Tray/);
  assert.match(page,/Remember this decision/);
  assert.doesNotMatch(page,/privateKey|PRIVATE KEY/);
});
