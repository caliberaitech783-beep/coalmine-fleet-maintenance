import test from 'node:test';
import assert from 'node:assert/strict';
import {brotliCompressSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {CDIR_MASTERS as M,CDIR_MASTER_NAMES} from '../cdir-masters.mjs';
import {decodeCdirRoster,replaceCdirRoster} from '../cdir-roster-import.mjs';

const payload=()=>({version:1,expectedRows:3,masters:{
  [M.region]:[{code:'CORP',name:'Corporate'}],
  [M.site]:[{name:'Office',code:'office',region:'CORP',rosterKey:'OFFICE'}],
  [M.category]:[{code:'A'}],
  [M.department]:[{department:'IT'}],
  [M.designation]:[{designation:'Manager'},{designation:'Coordinator'}],
  [M.employee]:[
    {name:'Test Person',empId:'TEST1',site:'Office',category:'A',department:'IT',designation:'Manager',status:'ACTIVE',doj:'2020-01-01'},
    {name:'Test Person',empId:'TEST1',site:'Office',category:'A',department:'IT',designation:'Coordinator',status:'ACTIVE',doj:'2020-01-01'},
    {name:'',empId:'',site:'Office',category:'A',department:'IT',designation:'Manager',status:'VACANT'},
  ],
  [M.contact]:[{name:'Test Person',empId:'TEST1',email:'example@example.test'}],
}});
const encode=value=>brotliCompressSync(Buffer.from(JSON.stringify(value))).toString('base64');

test('validates roster counts and preserves multiple assignments and vacancies',()=>{
  const result=decodeCdirRoster(encode(payload()));
  assert.deepEqual(result.summary,{rows:3,active:2,vacant:1,sites:1,departments:1});
  assert.equal(result.masters[M.employee][0].name,'TEST PERSON');
  assert.match(result.revision,/^[a-f0-9]{64}$/);
});

test('rejects incomplete, unrelated and conflicting source data before writing',()=>{
  const cases=[
    p=>{p.expectedRows=4;},
    p=>{delete p.masters[M.contact];},
    p=>{p.masters['Users & employees']=[];},
    p=>{p.masters[M.employee][0].site='Unknown';},
    p=>{p.masters[M.employee][0].department='Unknown';},
    p=>{p.masters[M.employee][0].name='Different person';},
    p=>{p.masters[M.contact].push({...p.masters[M.contact][0]});},
    p=>{p.masters[M.employee][0].login='admin';},
    p=>{p.masters[M.site][0].region='Unknown';},
  ];
  for(const change of cases){const p=payload();change(p);assert.throws(()=>decodeCdirRoster(encode(p)));}
  assert.throws(()=>decodeCdirRoster('invalid'));
});

test('rolls back a failed replacement and releases the connection',async()=>{
  const calls=[];
  const client={query:async(sql)=>{calls.push(sql);if(sql.startsWith('DELETE'))throw new Error('write failed');return {rows:[],rowCount:0};},release:()=>calls.push('release')};
  await assert.rejects(replaceCdirRoster({connect:async()=>client},encode(payload())),/write failed/);
  assert.equal(calls.at(-2),'ROLLBACK');
  assert.equal(calls.at(-1),'release');
  assert.ok(!calls.includes('COMMIT'));
});

test('same approved revision is not applied again',async()=>{
  const calls=[];
  const summary={rows:3,active:2,vacant:1,sites:1,departments:1};
  const client={query:async(sql)=>{calls.push(sql);return sql.startsWith('SELECT summary')?{rowCount:1,rows:[{summary}]}:{rowCount:0,rows:[]};},release:()=>{}};
  const result=await replaceCdirRoster({connect:async()=>client},encode(payload()));
  assert.equal(result.applied,false);
  assert.ok(!calls.some(sql=>sql.startsWith('DELETE')));
});

test('database replacement backs up seven masters, preserves unrelated data, and runs once',{
  skip:!process.env.AUTH_SESSION_TEST_DATABASE_URL,
},async()=>{
  const schema=`cdir_test_${randomUUID().replaceAll('-','')}`;
  const admin=new pg.Pool({connectionString:process.env.AUTH_SESSION_TEST_DATABASE_URL,ssl:process.env.AUTH_SESSION_TEST_DATABASE_SSL==='false'?false:undefined});
  let pool;
  try{
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool=new pg.Pool({connectionString:process.env.AUTH_SESSION_TEST_DATABASE_URL,ssl:process.env.AUTH_SESSION_TEST_DATABASE_SSL==='false'?false:undefined,options:`-c search_path=${schema}`});
    await pool.query('CREATE TABLE master_records (id SERIAL PRIMARY KEY,master_name TEXT,record_data JSONB,created_at TIMESTAMPTZ DEFAULT NOW())');
    await pool.query('INSERT INTO master_records (master_name,record_data) VALUES ($1,$2::jsonb),($3,$4::jsonb)',[M.site,JSON.stringify({name:'Office',code:'saved-office',rosterKey:'EXISTING'}),'Equipment master',JSON.stringify({equipment:'KEEP'})]);
    const encoded=encode(payload());
    assert.equal((await replaceCdirRoster(pool,encoded)).applied,true);
    const backup=await pool.query('SELECT previous_records FROM cdir_roster_imports');
    assert.equal(backup.rows[0].previous_records.length,1);
    assert.equal(backup.rows[0].previous_records[0].record_data.code,'saved-office');
    const site=await pool.query('SELECT record_data FROM master_records WHERE master_name=$1',[M.site]);
    assert.equal(site.rows[0].record_data.code,'saved-office');
    const count=await pool.query('SELECT count(*)::int AS count FROM master_records WHERE master_name=$1',[M.employee]);
    assert.equal(count.rows[0].count,3);
    assert.equal((await pool.query('SELECT record_data FROM master_records WHERE NOT (master_name=ANY($1::text[]))',[CDIR_MASTER_NAMES])).rows[0].record_data.equipment,'KEEP');
    await pool.query("UPDATE master_records SET record_data=record_data||'{\"name\":\"LATER EDIT\"}' WHERE master_name=$1",[M.employee]);
    assert.equal((await replaceCdirRoster(pool,encoded)).applied,false);
    assert.equal((await pool.query('SELECT record_data FROM master_records WHERE master_name=$1 LIMIT 1',[M.employee])).rows[0].record_data.name,'LATER EDIT');
  }finally{await pool?.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
