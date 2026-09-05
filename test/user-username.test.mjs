import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {duplicateUsername,normalizeUsername} from '../user-username.mjs';

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

test('user creation locks and checks records before insertion and surfaces the error',()=>{
  assert.match(server,/LOCK TABLE master_records IN SHARE ROW EXCLUSIVE MODE/);
  assert.match(server,/const conflict=duplicateUsername\(existing\.rows\.map\(row=>row\.record_data\),prepared\)/);
  assert.match(server,/status\(409\)\.json\(\{error:'This username already exists\.'\}\)/);
  assert.match(ui,/await onAdd\(\[record\]\);\s*setMode\(null\);[\s\S]*alert\(error\?\.message/);
});
