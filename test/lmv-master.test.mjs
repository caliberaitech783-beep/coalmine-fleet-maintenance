import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {masterAccessAllows} from '../admin-access.mjs';
const client=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
test('LMV inherits Equipment Master desktop/mobile access without widening access',()=>{
  for(const key of ['masterAccess','mobileMasterAccess']) {
    assert.equal(masterAccessAllows({[key]:['Equipment master']},'LMV master',key),true);
    assert.equal(masterAccessAllows({[key]:['OEM master']},'LMV master',key),false);
  }
  assert.equal(masterAccessAllows({hrDirectoryMasters:true},'LMV master'),false);
});
test('LMV sub-master shares equipment fields and renderer with independent storage and reset state',()=>{
  assert.match(client,/masterFields\["LMV master"\] = masterFields\["Equipment master"\]/);
  assert.match(client,/aria-label="Equipment sub-masters"/);
  assert.match(client,/<EquipmentMasterPage initialFilter=/);
  assert.match(client,/useMasterRecords\(masterName, masterName === "Equipment master" \? vehicles : \[\]\)/);
  assert.match(client,/<Equipment \{\.\.\.props\} key=\{masterName\} masterName=\{masterName\}/);
  assert.match(client,/<MasterActions name=\{masterName\}/);
  assert.match(client,/\["Vehicle transfers", "Equipment master"\]\.includes\(name\)/);
});
test('LMV uses equipment normalization and duplicate identities within its own namespace',()=>{
  assert.match(server,/\['Equipment master','LMV master'\]\.includes\(master\)\)return normalizeOperationalSiteFields\(equipmentMasterWithDoor\(record\)\)/);
  assert.match(server,/master==='Equipment master'\|\|master==='Shift Master'\|\|master==='LMV master'/);
  assert.match(server,/const identityFor=master==='Shift Master'\?shiftIdentity:equipmentIdentity/);
  assert.match(server,/SELECT id,record_data FROM master_records WHERE master_name=\$1 FOR UPDATE/);
  assert.match(server,/if\(managerRecord&&\['Equipment master','LMV master'\]\.includes\(row.master_name\)\)/);
});

test('LMV selected deletion executes against LMV records only',async()=>{
  const start=server.indexOf("app.delete('/api/masters/:master/selected'");
  const end=server.indexOf("app.delete('/api/masters/:master/:id'",start);
  const route=server.slice(start,end);
  const calls=[];
  const handler=new Function('app','requireSuper','cdirWriteError','AUDIT_REASON_HEADER','pool',`${route};return app.handler;`)(
    {delete(_path,_auth,handler){this.handler=handler;}},()=>{},()=>'', 'X-Audit-Reason',
    {async query(sql,params){calls.push({sql,params});return {rowCount:2};}},
  );
  const req={params:{master:'LMV%20master'},body:{ids:[7,8,7]},get:()=> 'Duplicate records'};
  let result;
  const res={json(value){result=value;},status(value){throw new Error(`Unexpected status ${value}`);}};
  await handler(req,res,error=>{throw error;});
  assert.deepEqual(calls[0].params,['LMV master',[7,8]]);
  assert.deepEqual(result,{deleted:2});
  assert.equal(req.audit.module,'LMV master');
});
