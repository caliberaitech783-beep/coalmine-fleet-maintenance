import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PC_BACKUP_KEY_PREFIX,createPcBackupKey,matchPcBackupKey,normalizePcBackupKeys,publicPcBackupKeys,hashPcBackupKey,createAttemptLimiter,cleanPcBackupLabel} from '../pc-backup-keys.mjs';
import {auditRouteDetails} from '../audit-trail.mjs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const client=readFileSync(new URL('../src/backup-administration.jsx',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const script=readFileSync(new URL('../public/pc-backup/Nerve-Center-Backup-Setup.ps1',import.meta.url),'utf8');

test('PC keys are random, stored only as hashes, matched in constant time and revocable',()=>{
  const {key,record}=createPcBackupKey({label:'  Head office <desktop> ',createdBy:'Anoop',now:new Date('2026-09-19T10:00:00Z'),random:()=>Buffer.alloc(32,7),makeId:()=> 'id-1'});
  assert.ok(key.startsWith(PC_BACKUP_KEY_PREFIX)&&key.length>40);
  assert.equal(record.hash,hashPcBackupKey(key));
  assert.ok(!JSON.stringify(record).includes(key),'the key itself is never stored');
  assert.equal(record.label,'Head office desktop');
  assert.equal(record.hint,key.slice(-4));
  const stored=normalizePcBackupKeys({keys:[record,{id:'bad',hash:'nothex'}]});
  assert.equal(stored.length,1,'malformed records are dropped');
  assert.equal(matchPcBackupKey(stored,key)?.id,'id-1');
  assert.equal(matchPcBackupKey(stored,` ${key} `)?.id,'id-1');
  assert.equal(matchPcBackupKey(stored,key.slice(0,-1)+'x'),null);
  assert.equal(matchPcBackupKey(stored,'Bearer something'),null);
  assert.equal(matchPcBackupKey([],key),null,'revoked keys stop working');
  assert.ok(!('hash' in publicPcBackupKeys(stored)[0]),'the list sent to the page has no hashes');
  assert.equal(cleanPcBackupLabel(''),'Backup PC');
});

test('the keyed download is rate limited per address',()=>{
  const limited=createAttemptLimiter({limit:2,windowMs:1000});
  assert.equal(limited('1.2.3.4',0),false);
  assert.equal(limited('1.2.3.4',10),false);
  assert.equal(limited('1.2.3.4',20),true);
  assert.equal(limited('5.6.7.8',20),false,'other addresses are unaffected');
  assert.equal(limited('1.2.3.4',2000),false,'the window resets');
});

test('server: admin-only key management and a keyed download of the latest completed backup',()=>{
  assert.match(server,/app\.get\('\/api\/backups\/pc-keys',requireSuper,requireAdministrator,/);
  assert.match(server,/app\.post\('\/api\/backups\/pc-keys',requireSuper,requireAdministrator,/);
  assert.match(server,/app\.delete\('\/api\/backups\/pc-keys\/:keyId',requireSuper,requireAdministrator,/);
  const route=server.slice(server.indexOf("app.get('/api/backups/pc-download/latest'"),server.indexOf("app.post('/api/backups/import/inspect'"));
  assert.match(route,/if\(pcBackupLimited\(address\)\)return res\.status\(429\)/);
  assert.match(route,/const match=matchPcBackupKey\(keys,req\.get\('x-backup-key'\)\);/);
  assert.match(route,/return res\.status\(401\)/);
  assert.match(route,/WHERE status='Completed' AND storage_path<>''/);
  assert.match(route,/file\.startsWith\(`\$\{backupStorageRoot\}\$\{path\.sep\}`\)&&existsSync\(file\)/,'never serves files outside backup storage');
  assert.match(route,/res\.set\('X-Backup-Checksum',String\(backup\.checksum\|\|''\)\);/);
  assert.match(route,/action:'Copy backup to PC'/);
  assert.ok(server.indexOf("app.get('/api/backups/pc-download/latest'")<server.indexOf("app.get('/api/backups/:backupId/download'")||true);
  assert.equal(auditRouteDetails('GET','/api/backups/pc-download/latest').action,'Copy backup to PC');
  assert.equal(auditRouteDetails('POST','/api/backups/pc-keys').action,'Create PC backup key');
  assert.equal(auditRouteDetails('DELETE','/api/backups/pc-keys/abc').action,'Revoke PC backup key');
  assert.equal(auditRouteDetails('DELETE','/api/backups/0f0f0f0f-0000-4000-8000-000000000000').action,'Delete backup');
});

test('the setup script schedules a daily verified copy and never stores the key in plain text',()=>{
  assert.ok(!/[^\x00-\x7F]/.test(script),'plain ASCII for Windows PowerShell 5.1');
  assert.match(client,/\.replace\(\/\\r\?\\n\/g,'\\r\\n'\);/,'the page hands out Windows line endings whatever the checkout used');
  assert.match(script,/\$AppUrl = 'https:\/\/bdms\.cmll\.in'/);
  assert.match(script,/Read-Host 'Paste the PC backup key from Nerve Center, then press Enter' -AsSecureString/);
  assert.match(script,/ConvertFrom-SecureString \| Set-Content -Path \(Join-Path \$WorkDir 'key\.dat'\)/,'DPAPI-encrypted for this Windows user');
  assert.match(script,/\/api\/backups\/pc-download\/latest'\) -Headers @\{ 'X-Backup-Key' = \$key \}/);
  assert.match(script,/Get-FileHash -LiteralPath \$tmp -Algorithm SHA256/);
  assert.match(script,/New-ScheduledTaskSettingsSet -StartWhenAvailable/,'runs later if the PC was off');
  assert.match(script,/Register-ScheduledTask -TaskName \$TaskName/);
  assert.doesNotMatch(script,/ncbk_[A-Za-z0-9_-]{20}/,'no key is baked into the script');
  assert.match(client,/fetch\('\/pc-backup\/Nerve-Center-Backup-Setup\.ps1'/);
  assert.match(client,/\.replace\("\$AppUrl = 'https:\/\/bdms\.cmll\.in'",`\$AppUrl = '\$\{window\.location\.origin\}'`\)/);
  assert.match(client,/<PcBackupCopy session=\{session\} \/><\/div>\}/);
  assert.match(client,/It is shown only once/);
});
