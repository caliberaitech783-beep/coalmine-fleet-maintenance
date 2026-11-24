import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtemp,mkdir,copyFile,readdir,writeFile,stat,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {PGlite} from '@electric-sql/pglite';
import {encryptStream} from '../backup-crypto.mjs';
import {planKeepNewest,housekeepingMessage,deletedMessage,registerFullBackup,FULL_BACKUP_KEEP} from '../full-backup.mjs';

const file=(letter)=>`full-backup-${letter.repeat(8)}-0000-4000-8000-000000000000.enc`;
const day=(date)=>new Date(`2026-11-${String(date).padStart(2,'0')}T22:30:00Z`).toISOString();
const row=(letter,date,{verified=true,status='Partial'}={})=>({id:letter,status,fileName:file(letter),completedAt:day(date),verifiedBytes:verified?100:0});

test('the newest three checked backups stay; older files go only once three checked ones exist',()=>{
  assert.equal(FULL_BACKUP_KEEP,3);
  const files=['a','b','c','d','e'].map(letter=>({name:file(letter),bytes:10,mtimeMs:0}));
  // Two checked backups: nothing may be removed yet, even the old unchecked ones.
  const early=planKeepNewest({rows:[row('a',10,{verified:false}),row('b',11,{verified:false}),row('c',12),row('d',13)],files});
  assert.equal(early.ready,false);assert.equal(early.checked,2);assert.deepEqual(early.removeFiles,[]);assert.deepEqual(early.expireRows,[]);
  // Three checked: everything older than the oldest kept one goes, the kept ones stay.
  const plan=planKeepNewest({rows:[row('a',10,{verified:false}),row('b',11),row('c',12),row('d',13),row('e',14)],files});
  assert.equal(plan.ready,true);
  assert.deepEqual(plan.kept.map(item=>item.id),['e','d','c']);
  assert.deepEqual(plan.removeFiles.map(item=>item.name),[file('a'),file('b')]);
  assert.deepEqual(plan.expireRows,['a','b']);
});

test('an unchecked backup newer than the kept ones is never removed, and unknown files go by age only',()=>{
  const rows=[row('b',11),row('c',12),row('d',13),row('e',14,{verified:false})];
  const files=[
    {name:file('e'),bytes:5,mtimeMs:0},
    {name:file('f'),bytes:5,mtimeMs:Date.parse(day(20))},
    {name:file('9'),bytes:5,mtimeMs:Date.parse(day(1))},
    {name:'notes.txt',bytes:5,mtimeMs:0},
    {name:file('a')+'.partial',bytes:5,mtimeMs:0},
  ];
  const plan=planKeepNewest({rows,files});
  assert.deepEqual(plan.kept.map(item=>item.id),['d','c','b']);
  // e (doubtful but newer) and f (unknown but recent) stay; 9 (unknown, older than every kept one) goes.
  assert.deepEqual(plan.removeFiles.map(item=>item.name),[file('9')]);
  assert.deepEqual(plan.expireRows,[]);
  // Removed or failed rows never count as kept backups.
  const ignored=planKeepNewest({rows:[row('b',11),row('c',12,{status:'Removed'}),row('d',13,{status:'Failed'})],files:[]});
  assert.equal(ignored.ready,false);assert.equal(ignored.checked,1);
});

test('the Telegram text names kept days, removed sizes and the drive',()=>{
  const plan=planKeepNewest({rows:[row('b',11),row('c',12),row('d',13),row('e',14)],files:[{name:file('b'),bytes:2*1024**3,mtimeMs:0}]});
  const text=housekeepingMessage({title:'Pulse full backup finished',newBackup:{completedAt:day(14),bytes:3*1024**3},plan,removed:[{name:file('b'),bytes:2*1024**3,day:'12 Nov'}],disk:{freeBytes:100*1024**3,totalBytes:500*1024**3}});
  assert.match(text,/^Pulse full backup finished/);
  assert.match(text,/New backup: 15 Nov.*3\.0 GB, checked complete on disk\./);
  assert.match(text,/Kept \(newest 3 checked\): 15 Nov, 14 Nov, 13 Nov\./);
  assert.match(text,/Removed from this server: 12 Nov 2\.0 GB \(2\.0 GB freed\)\./);
  assert.match(text,/Drive: 100\.0 GB free of 500\.0 GB\./);
  const waiting=housekeepingMessage({title:'x',plan:{ready:false,checked:1}});
  assert.match(waiting,/Old backups kept: 1 of 3 checked backups so far/);
});

test('the encrypted archive reports exactly the bytes it put on disk',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'pulse-size-'));
  const keys=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  try{
    const archive=path.join(directory,'backup.enc');
    const result=await encryptStream(Readable.from([Buffer.alloc(300000,7),Buffer.alloc(5,1)]),archive,keys.publicKey);
    assert.equal(result.bytes,(await stat(archive)).size);
  }finally{await rm(directory,{recursive:true,force:true});}
});

async function harness({freeBytes=Infinity}={}){
  const directory=await mkdtemp(path.join(os.tmpdir(),'pulse-keep-')),db=new PGlite();
  const keys=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  const query=async(sql,params)=>{if(typeof sql==='object'){const result=await db.query(sql.text,sql.values);return {rows:result.rows.map(item=>Object.values(item))};}if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};if(sql.includes('pg_advisory_unlock'))return {rows:[]};const result=await db.query(sql,params);return {...result,rowCount:result.affectedRows??result.rows.length};};
  await db.exec("CREATE TABLE app_settings(setting_key TEXT PRIMARY KEY,setting_value JSONB,updated_at TIMESTAMPTZ);");
  await writeFile(path.join(directory,'recovery-public.pem'),keys.publicKey);
  await mkdir(path.join(directory,'scripts'));
  for(const name of ['FULL_BACKUP_RECOVERY.md','backup-crypto.mjs','scripts/decrypt-full-backup.mjs'])await copyFile(new URL('../'+name,import.meta.url),path.join(directory,name));
  const notices=[],deletes=[],app={get(){},post(){},put(){}};
  const service=registerFullBackup(app,{pool:{query,connect:async()=>({query,release(){}})},root:directory,storageRoot:directory,requireSuper(){},requireAdministrator(){},isReady:()=>true,scheduledJobsEnabled:true,commit:'fixture',env:{},notify:message=>{notices.push(message);},notifyDelete:message=>{deletes.push(message);},diskSpace:async()=>({freeBytes,totalBytes:500*1024**3}),spaceMargin:1024});
  const close=async()=>{await db.close();await rm(directory,{recursive:true,force:true});};
  return {directory,db,service,notices,deletes,close};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,20));

test('after the fourth checked backup only the newest three files remain and the oldest is marked Removed',async()=>{
  const {directory,db,service,notices,deletes,close}=await harness();
  try{
    // An old backup written before the size check existed, plus a leftover half-written work folder.
    const legacy=file('a');
    await service.run({waitForCompletion:true});
    await writeFile(path.join(directory,'full-recovery',legacy),'old');
    await db.query("INSERT INTO full_backup_runs(id,status,trigger_type,file_name,size_bytes,completed_at) VALUES('aaaaaaaa-0000-4000-8000-000000000000','Partial','Scheduled',$1,3,NOW()-INTERVAL '30 days')",[legacy]);
    for(let index=0;index<3;index++){await settle();await service.run({waitForCompletion:true});}
    const names=(await readdir(path.join(directory,'full-recovery'))).filter(name=>/^full-backup-.*\.enc$/.test(name));
    const {rows}=await db.query("SELECT id,status,file_name,verified_bytes,size_bytes FROM full_backup_runs ORDER BY completed_at DESC");
    const kept=rows.filter(item=>item.status==='Partial');
    assert.equal(kept.length,3);
    for(const item of kept){assert.equal(Number(item.verified_bytes),Number(item.size_bytes));assert.ok(names.includes(item.file_name));}
    assert.equal(names.length,3,'only the three newest checked backups stay on disk');
    assert.deepEqual(rows.filter(item=>item.status==='Removed').length,2,'the legacy and the first checked backup are marked Removed');
    assert.ok(!names.includes(legacy));
    // Each finished backup posts a notice; the last one reports what was removed.
    for(let attempt=0;attempt<50&&notices.length<4;attempt++)await settle();
    assert.match(notices[0],/Old backups kept: 1 of 3 checked backups so far/);
    assert.match(notices.at(-1),/Removed from this server: .*freed\)\./);
    // Mohit and Anoop get a personal notice for each delete, and none while nothing was deleted.
    for(let attempt=0;attempt<50&&deletes.length<2;attempt++)await settle();
    assert.equal(deletes.length,2);
    for(const message of deletes){assert.match(message,/^Pulse Azure server: old backups deleted/);assert.match(message,/Old backup .* deleted \(keep-newest-3 rule\)\./);assert.match(message,/Total freed: /);}
  }finally{await close();}
});

test('the personal delete notice lists every deleted item and the total freed',()=>{
  const text=deletedMessage({backups:[{day:'12 Nov',bytes:2*1024**3}],leftovers:[{name:'work-abc',bytes:1024**3}],disk:{freeBytes:5*1024**3,totalBytes:500*1024**3}});
  assert.match(text,/^Pulse Azure server: files deleted/);
  assert.match(text,/Old backup 12 Nov 2\.0 GB deleted \(keep-newest-3 rule\)\./);
  assert.match(text,/Half-finished backup work work-abc 1\.0 GB deleted \(left by an interrupted backup\)\./);
  assert.match(text,/Total freed: 3\.0 GB\./);
  assert.match(text,/Drive: 5\.0 GB free of 500\.0 GB\./);
});

test('half-finished work left by an interrupted backup is deleted before the next run and reported personally',async()=>{
  const {directory,service,deletes,close}=await harness();
  try{
    await service.run({waitForCompletion:true});
    const work=path.join(directory,'full-recovery','work-Interrupted1');
    await mkdir(work);await writeFile(path.join(work,'database.ndjson.gz'),Buffer.alloc(4096,1));
    await service.run({waitForCompletion:true});
    for(let attempt=0;attempt<50&&!deletes.length;attempt++)await settle();
    assert.equal(deletes.length,1);
    assert.match(deletes[0],/^Pulse Azure server: files deleted before a backup/);
    assert.match(deletes[0],/Half-finished backup work work-Interrupted1 0\.0 GB deleted/);
    assert.ok(!(await readdir(path.join(directory,'full-recovery'))).includes('work-Interrupted1'));
  }finally{await close();}
});

test('no backup starts when the drive lacks room, and the owner is told once',async()=>{
  const {directory,db,service,notices,close}=await harness({freeBytes:10});
  try{
    await assert.rejects(service.run({slot:'2026-11-25',waitForCompletion:true}),error=>error.code==='FULL_BACKUP_NO_SPACE'&&error.status===409);
    await assert.rejects(service.run({slot:'2026-11-25',waitForCompletion:true}),error=>error.code==='FULL_BACKUP_NO_SPACE');
    await settle();
    assert.equal(notices.length,1);assert.match(notices[0],/Pulse full backup NOT started/);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM full_backup_runs')).rows[0].n,0);
    assert.deepEqual((await readdir(path.join(directory,'full-recovery'))).filter(name=>name.endsWith('.enc')),[]);
  }finally{await close();}
});
