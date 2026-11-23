import assert from 'node:assert/strict';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {CDIR_MASTERS} from '../cdir-masters.mjs';
import {createDieselEmployeeReader,dieselEmployeeLink} from '../diesel-employee-link.mjs';

const employees=[{empId:'E001',name:'RAVI KUMAR',status:'ACTIVE'},
  {empId:'E002',name:'RAVI KUMAR',status:'ACTIVE'}];
const contacts=[{empId:'E001',name:'RAVI KUMAR',email:'ravi@example.test',contact:'9000000001'},
  {empId:'E002',name:'RAVI KUMAR',email:'other@example.test',contact:'9000000002'}];

test('Diesel links short account names by saved employee ID or exact registered contact',()=>{
  const expected={empId:'E001'};
  for(const field of ['empId','employeeId','employeeCode'])
    assert.deepEqual(dieselEmployeeLink({login:'rk',employee:'Ravi K',empId:'',[field]:' e001 '},employees,contacts),expected);
  assert.deepEqual(dieselEmployeeLink({login:'rk',employee:'Ravi K',email:' RAVI@EXAMPLE.TEST '},employees,contacts),expected);
  assert.deepEqual(dieselEmployeeLink({login:'rk',employee:'Ravi K',phone:'+91 90000 00001'},employees,contacts),expected);
  assert.deepEqual(dieselEmployeeLink({login:'unrelated',employee:' ravi kumar '},[employees[0]],[]),expected);
  assert.deepEqual(dieselEmployeeLink({phone:'9000000001'},[employees[0]],[{name:'RAVI KUMAR',contact:'9000000001'}]),expected);
});

test('Diesel rejects conflicting IDs, contacts and ambiguous names without guessing from an alias',()=>{
  for(const user of [{employee:'Ravi'}, {login:'ravikumar'}, {employee:'RAVI KUMAR'},
    {empId:'missing',email:'ravi@example.test'}, {email:'ravi@example.test',phone:'9000000002'},
    {email:'shared@example.test'}, {phone:'123'}])
    assert.equal(dieselEmployeeLink(user,employees,[...contacts,...contacts.map(row=>({...row,email:'shared@example.test'}))]),undefined);
  assert.equal(dieselEmployeeLink({phone:'9000000001'},employees,[{empId:'missing',contact:'9000000001'}]),undefined);
  assert.equal(dieselEmployeeLink({empId:'E001'},[employees[0],{...employees[0],name:'Different person'}],contacts),undefined);
});

test('reader resolves only the authenticated login account and rereads corrected master links',async()=>{
  const db=new PGlite();
  try {
    await db.query('CREATE TABLE master_records (master_name TEXT, record_data JSONB)');
    const insert=(master,data)=>db.query('INSERT INTO master_records VALUES ($1,$2)',[master,JSON.stringify(data)]);
    await insert('Users & employees',{login:'rk',employee:'Ravi K',phone:'9000000001',passwordHash:'private'});
    await insert('Users & employees',{employee:'rk legacy',empId:'E002'});
    await insert('Users & employees',{login:'different',employee:'Ravi K',empId:'E002'});
    for(const employee of employees)await insert(CDIR_MASTERS.employee,employee);
    for(const contact of contacts)await insert(CDIR_MASTERS.contact,contact);
    const read=createDieselEmployeeReader(db);
    assert.deepEqual(await read({login:' RK ',name:'Short name'}),{empId:'E001'});
    assert.equal(await read({login:'unknown',name:'Ravi K'}),undefined);
    await db.query(`UPDATE master_records SET record_data=record_data||'{"phone":"9000000002"}'::jsonb
      WHERE master_name='Users & employees' AND record_data->>'login'='rk'`);
    assert.deepEqual(await read({login:'rk'}),{empId:'E002'});
    await insert('Users & employees',{login:'rk',empId:'E001'});
    assert.equal(await read({login:'rk'}),undefined);
  } finally {await db.close();}
});
