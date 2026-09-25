import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {duplicateUsername,lockUsernamesForWrite,normalizeUsername,USERNAME_WRITE_LOCK_KEY} from '../user-username.mjs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');

test('username matching is exact after trimming and ignores letter case',()=>{
  assert.equal(normalizeUsername('  Sanskar  '),'sanskar');
  assert.equal(duplicateUsername([{login:'SANSKAR'}],[{login:'sanskar'}]),'sanskar');
  assert.equal(duplicateUsername([{login:'SANSKAR'}],[{login:'sanskar m'}]),'');
});

test('duplicate usernames inside one import are rejected',()=>{
  assert.equal(duplicateUsername([],[{login:'Employee 1'},{login:' employee 1 '}]),'employee 1');
});

test('user creation serializes username writes without locking the shared master table',async()=>{
  const calls=[];
  await lockUsernamesForWrite({query:async(...args)=>calls.push(args)});
  assert.deepEqual(calls,[['SELECT pg_advisory_xact_lock(hashtext($1))',[USERNAME_WRITE_LOCK_KEY]]]);
  const masterCreateRoute=server.slice(server.indexOf("app.post('/api/masters/:master'"),server.indexOf("app.post('/api/masters/:master/:id/password'"));
  const userCreateBranch=masterCreateRoute.slice(masterCreateRoute.indexOf("if(master==='Users & employees')"),masterCreateRoute.indexOf("}else if(master==='Equipment master'"));
  assert.match(userCreateBranch,/await lockUsernamesForWrite\(client\)/);
  assert.doesNotMatch(userCreateBranch,/LOCK TABLE master_records/);
  assert.match(server,/const conflict=duplicateUsername\(existing\.rows\.map\(row=>row\.record_data\),prepared\)/);
  assert.match(server,/status\(409\)\.json\(\{error:'This username already exists\.'\}\)/);
  assert.match(ui,/await onAdd\(\[record\]\);\s*setMode\(null\);[\s\S]*alert\(error\?\.message/);
});

test('master saves report an HTML gateway failure as temporary unavailability',()=>{
  const addMasterRecords=ui.slice(ui.indexOf('const add = async (incoming'),ui.indexOf('const edit = async (id, record)',ui.indexOf('const add = async (incoming')));
  assert.match(addMasterRecords,/\[502, 503, 504\]\.includes\(response\.status\)/);
  assert.match(addMasterRecords,/The server is temporarily unavailable\. Nothing was saved; please try again\./);
  assert.doesNotMatch(addMasterRecords,/response\.json\(\)/);
});
