import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {canEditCdirEmployee,registerCdirEmployeeEdit} from '../cdir-employee-edit.mjs';
import {CDIR_MASTERS,cdirDirectoryFromMasters} from '../cdir-masters.mjs';

test('only explicit administrators and the exact MAHAKDUDANI login can edit',()=>{
 for(const session of [{role:'super',permissions:{adminLevel:'Admin'}},{role:'super',permissions:{adminLevel:'Super Admin'}},{login:'MAHAKDUDANI'},{login:' mahakdudani '}])assert.equal(canEditCdirEmployee(session),true);
 for(const session of [null,{}, {role:'super'}, {role:'super',permissions:{adminLevel:'Manager'}},{login:'mahakdudani2',name:'MAHAKDUDANI'},{role:'normal',permissions:{adminLevel:'Admin'}}])assert.equal(canEditCdirEmployee(session),false);
});
test('profile employee edit uses exact master id and persists atomically with stale-write protection',async()=>{
 const db=new PGlite();await db.exec('CREATE TABLE master_records(id SERIAL PRIMARY KEY, master_name TEXT, record_data JSONB)');
 const insert=async(master,record)=>(await db.query('INSERT INTO master_records(master_name,record_data) VALUES($1,$2) RETURNING id',[master,JSON.stringify(record)])).rows[0].id;
 await insert(CDIR_MASTERS.site,{name:'Majri OC'});await insert(CDIR_MASTERS.category,{code:'A'});
 const id=await insert(CDIR_MASTERS.employee,{name:'ONE',empId:'E1',site:'Majri OC',category:'A',status:'ACTIVE',order:'20'});
 await insert(CDIR_MASTERS.contact,{name:'ONE',contact:'111',email:'old@example.com'});
 const client={query:(...args)=>db.query(...args),release(){}};
 const pool={...client,connect:async()=>client};
 const loadMasters=async(names,connection=client)=>{const {rows}=await connection.query('SELECT master_name,record_data FROM master_records WHERE master_name=ANY($1::text[])',[names]);return Object.fromEntries(names.map(name=>[name,rows.filter(r=>r.master_name===name).map(r=>r.record_data)]));};
 const routes={};const sessionMiddleware=()=>{};
 registerCdirEmployeeEdit({get:(path,...handlers)=>routes.get=handlers,patch:(path,...handlers)=>routes.patch=handlers},{pool,requireSession:sessionMiddleware,loadMasters,auditChangedFields:()=>['name','contact']});
 assert.equal(routes.patch[0],sessionMiddleware);
 let forbidden;routes.patch[1]({session:{login:'other'}},{status:code=>({json:()=>forbidden=code})},()=>assert.fail('Unauthorized access'));
 assert.equal(forbidden,403);
 const response=()=>({set(){},json(value){this.body=value;}});
 const get=response();await routes.get[2]({params:{id:String(id)}},get,error=>{throw error;});
 assert.equal(get.body.record.contact,'111');
 assert.equal(get.body.record.empId,undefined);
 const req={params:{id:String(id)},body:{revision:get.body.revision,record:{...get.body.record,name:'two',contact:'222'}}};
 await routes.patch[2](req,response(),error=>{throw error;});
 let records=await loadMasters([CDIR_MASTERS.employee,CDIR_MASTERS.contact]);
 assert.equal(records[CDIR_MASTERS.employee][0].name,'TWO');assert.equal(records[CDIR_MASTERS.employee][0].order,'20');
 assert.equal(records[CDIR_MASTERS.contact].length,1);assert.equal(records[CDIR_MASTERS.contact][0].contact,'222');assert.equal(records[CDIR_MASTERS.contact][0].email,'old@example.com');assert.equal(req.audit.action,'Edit employee');
 let conflict;await routes.patch[2](req,response(),err=>conflict=err);assert.equal(conflict.status,409);
 let forbiddenField;await routes.patch[2]({...req,body:{...req.body,record:{adminLevel:'Admin'}}},response(),err=>forbiddenField=err);assert.equal(forbiddenField.status,400);
 const fresh=response();await routes.get[2]({params:{id:String(id)}},fresh,error=>{throw error;});
 let invalid;await routes.patch[2]({...req,body:{revision:fresh.body.revision,record:{name:'CHANGED',site:'missing'}}},response(),err=>invalid=err);assert.equal(invalid.status,400);
 records=await loadMasters([CDIR_MASTERS.employee]);assert.equal(records[CDIR_MASTERS.employee][0].name,'TWO');
 await db.close();
});
test('directory projection carries the stable master id for duplicate employee placements',()=>{
 const directory=cdirDirectoryFromMasters({[CDIR_MASTERS.site]:[{name:'Majri OC',code:'majri'}],[CDIR_MASTERS.category]:[{code:'A'}],[CDIR_MASTERS.employee]:[{id:10,name:'A',site:'Majri OC',category:'A'},{id:11,name:'A',site:'Majri OC',category:'A'}]});
 assert.deepEqual(directory.matrix['majri|A'].map(row=>row.recordId),[10,11]);
});
