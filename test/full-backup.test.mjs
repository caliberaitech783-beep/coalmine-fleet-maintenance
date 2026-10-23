import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm,access} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {encryptStream,decryptFile} from '../backup-crypto.mjs';
import {hostingCoverage,validServiceKey,fullDefaults,registerFullBackup} from '../full-backup.mjs';
import {PGlite} from '@electric-sql/pglite';
import yauzl from 'yauzl';

test('encrypted recovery round trip, wrong key and tampering reject without partial plaintext',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'pulse-crypto-'));
  const pair=()=>generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  const keys=pair(),other=pair(),archive=path.join(directory,'backup.enc'),out=path.join(directory,'recovery.zip');
  try{
    const data=Buffer.from('confidential settings\n'.repeat(100000));
    await encryptStream(Readable.from([data]),archive,keys.publicKey);
    const bytes=await readFile(archive);assert.equal(bytes.includes(Buffer.from('confidential settings')),false);
    await decryptFile(archive,out,keys.privateKey);assert.deepEqual(await readFile(out),data);
    await assert.rejects(decryptFile(archive,out,keys.privateKey));assert.deepEqual(await readFile(out),data);await rm(out);
    await assert.rejects(decryptFile(archive,out,other.privateKey));await assert.rejects(access(out));
    bytes[bytes.length-20]^=1;await writeFile(archive,bytes);
    await assert.rejects(decryptFile(archive,out,keys.privateKey));await assert.rejects(access(out));
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('missing, stale and incomplete Azure snapshots are never reported as full coverage',()=>{
  assert.equal(hostingCoverage(null).status,'Missing');
  assert.equal(hostingCoverage({capturedAt:'bad'}).status,'Stale');
  assert.equal(hostingCoverage({capturedAt:new Date(Date.now()-27*3600000).toISOString(),complete:true}).status,'Stale');
  assert.equal(hostingCoverage({capturedAt:new Date().toISOString(),complete:false}).status,'Partial');
});
test('service credential denies missing and mismatched values',()=>{
  assert.equal(validServiceKey('',''),false);assert.equal(validServiceKey('abc','abcd'),false);assert.equal(validServiceKey('abc','abd'),false);assert.equal(validServiceKey('abc','abc'),true);
});
test('full schedule defaults include every weekday with independent retention',()=>{
  const settings=fullDefaults();assert.equal(settings.scheduleTime,'03:00');assert.equal(settings.weekdays.length,7);assert.equal(settings.maxBackups,14);
});

test('full backup packages actual PostgreSQL data, media and secrets encrypted, with honest missing coverage',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'pulse-full-')),db=new PGlite();
  const routes=new Map(),app=Object.fromEntries(['get','post','put'].map(method=>[method,(route,...handlers)=>routes.set(method+' '+route,handlers)]));
  const keys=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  const query=async(sql,params)=>{if(typeof sql==='object'){const result=await db.query(sql.text,sql.values);return {rows:result.rows.map(row=>Object.values(row))};}if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};if(sql.includes('pg_advisory_unlock'))return {rows:[]};const result=await db.query(sql,params);return {...result,rowCount:result.affectedRows??result.rows.length};};
  try{
    await db.exec("CREATE TABLE app_settings(setting_key TEXT PRIMARY KEY,setting_value JSONB,updated_at TIMESTAMPTZ);CREATE TABLE evidence(id INT PRIMARY KEY,media TEXT);INSERT INTO evidence VALUES(1,'data:image/webp;base64,fixture');");
    await writeFile(path.join(directory,'recovery-public.pem'),keys.publicKey);
    const {mkdir,copyFile}=await import('node:fs/promises');await mkdir(path.join(directory,'scripts'));
    for(const file of ['FULL_BACKUP_RECOVERY.md','backup-crypto.mjs','scripts/decrypt-full-backup.mjs'])await copyFile(new URL('../'+file,import.meta.url),path.join(directory,file));
    const service=registerFullBackup(app,{pool:{query,connect:async()=>({query,release(){}})},root:directory,storageRoot:directory,requireSuper(){},requireAdministrator(){},isReady:()=>true,scheduledJobsEnabled:true,commit:'fixture',env:{DATABASE_URL:'fixture-secret',IDENTITY_HEADER:'transient-secret'}});
    const job=await service.run();let row;
    for(let attempt=0;attempt<200;attempt++){row=(await db.query('SELECT * FROM full_backup_runs WHERE id=$1',[job.id])).rows[0];if(row.status!=='Running')break;await new Promise(resolve=>setTimeout(resolve,10));}
    assert.equal(row.status,'Partial');assert.equal(row.coverage.hosting.status,'Missing');assert.equal(row.coverage.database.status,'Included');
    const archive=path.join(directory,'full-recovery',row.file_name),plain=path.join(directory,'recovered.zip');
    assert.equal((await readFile(archive)).includes(Buffer.from('fixture-secret')),false);
    await decryptFile(archive,plain,keys.privateKey);
    const entries=await new Promise((resolve,reject)=>yauzl.open(plain,{lazyEntries:true},(error,zip)=>{if(error)return reject(error);const entries={};zip.on('error',reject);zip.on('entry',entry=>zip.openReadStream(entry,async(error,stream)=>{if(error)return reject(error);const parts=[];try{for await(const chunk of stream)parts.push(chunk);entries[entry.fileName]=Buffer.concat(parts);zip.readEntry();}catch(e){reject(e);}}));zip.on('end',()=>resolve(entries));zip.readEntry();}));
    const environment=JSON.parse(entries['environment.json']);assert.equal(environment.DATABASE_URL,'fixture-secret');assert.equal(environment.IDENTITY_HEADER,undefined);
    const {gunzipSync}=await import('node:zlib');assert.match(gunzipSync(entries['database.ndjson.gz']).toString(),/data:image\/webp;base64,fixture/);
    const manifest=JSON.parse(entries['manifest.json']);assert.equal(manifest.commit,'fixture');assert.ok(entries['RECOVERY.md']);assert.equal(manifest.coverage.gitHistory.status,'Missing');
  }finally{await db.close();await rm(directory,{recursive:true,force:true});}
});
