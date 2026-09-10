import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {normalizeOperationalSiteFields,normalizeUserSiteFields} from '../region-scope.mjs';
import {normalizeUserAccessLabels} from '../mobile-access.mjs';
import {repairLegacySessionDefaults} from '../auth-session-schema.mjs';

const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const migration=source.slice(source.indexOf('async function migrate(){'),source.indexOf('// Large JSON payloads arrive'));

async function runStartup({users=[],initialized=true}={}){
  const initial=structuredClone(users),stored=structuredClone(users),queries=[];
  let released=false;
  const client={
    async query(sql,values){
      queries.push({sql,values});
      if(sql.startsWith('SELECT value FROM app_metadata'))return {rows:initialized?[{value:'current-version'}]:[]};
      if(sql.startsWith('SELECT id,record_data FROM master_records'))return {rows:structuredClone(stored)};
      if(sql.startsWith('SELECT id,master_name,record_data FROM master_records'))return {rows:stored.map(user=>({...structuredClone(user),master_name:'Users & employees'}))};
      if(sql.startsWith('INSERT INTO master_records')){
        const target=sql.includes("SELECT 'Delayed Reason'")?'Delayed Reason':values?.[0];
        assert.ok(['Repair type master','Delayed Reason'].includes(target),'startup must not insert a user account');
      }
      assert.doesNotMatch(sql,/UPDATE master_records SET record_data|DELETE FROM (?:master_records|auth_sessions)/,'startup fixture must not rewrite accounts or credentials');
      return {rows:[],rowCount:0};
    },
    release(){released=true;},
  };
  const context={
    pool:{query:client.query,connect:async()=>client},currentAppVersion:'current-version',repairTypeDefaults:['Breakdown'],DELAYED_REASON_DEFAULTS:['Awaiting parts'],
    normalizeOperationalSiteFields,normalizeUserSiteFields,normalizeUserAccessLabels,repairLegacySessionDefaults,
    hashPassword:()=>assert.fail('startup must not construct default account credentials'),
  };
  await runInNewContext(`${migration}\nmigrate();`,context);
  assert.deepEqual(stored,initial);
  assert.ok(released);
  assert.ok(queries.some(({sql})=>sql==='COMMIT'));
  assert.ok(queries.some(({sql})=>sql.includes('DO $session_compatibility$')),'startup repairs the legacy session default');
  return queries;
}

test('a fresh database startup never provisions a known-password privileged account',async()=>{
  await runStartup({initialized:false});
  assert.doesNotMatch(migration,/seededSuperAdmin|hashPassword\(/);
});

test('startup preserves existing privileged and normal accounts and their credential fields',async()=>{
  const users=[
    {id:1,record_data:{login:'existing-owner',adminLevel:'Super Admin',passwordHash:'existing-owner-credential',mustChangePassword:false}},
    {id:2,record_data:{login:'superadamin',adminLevel:'Super Admin',passwordHash:'existing-reviewed-credential',mustChangePassword:true}},
    {id:3,record_data:{login:'operator',userType:'Mobile User',passwordHash:'existing-operator-credential',mustChangePassword:false}},
  ];
  await runStartup({users});
});

test('removing or renaming a former default login does not trigger replacement on restart',async()=>{
  for(const users of [[],[{id:1,record_data:{login:'renamed-owner',adminLevel:'Super Admin',passwordHash:'retained-owner-credential'}}]]){
    const queries=await runStartup({users});
    assert.equal(queries.filter(({sql})=>sql.startsWith('INSERT INTO master_records')&&sql.includes('Users & employees')).length,0);
  }
});
