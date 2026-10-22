import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {CDIR_CHANGE_SCHEMA,registerCdirChanges} from '../cdir-change-requests.mjs';
import {CDIR_DELETION_SCHEMA,registerCdirDeletions} from '../cdir-deletion.mjs';
import {EMPLOYEE_TRANSFER_SCHEMA,registerEmployeeTransfers} from '../employee-transfer.mjs';
import {registerCdirEmployeeEdit} from '../cdir-employee-edit.mjs';
import {CDIR_MASTERS as M} from '../cdir-masters.mjs';
import {cdirApprovalRecipients} from '../cdir-approval-routing.mjs';
import {cdirSubmissionAllowed} from '../cdir-change-policy.mjs';
import {resolveMobileAccess} from '../mobile-access.mjs';

async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());await db.exec(`CREATE TABLE master_records(id SERIAL PRIMARY KEY,master_name TEXT,record_data JSONB);CREATE TABLE notices(recipient TEXT,reference TEXT);${CDIR_CHANGE_SCHEMA}${CDIR_DELETION_SCHEMA}${EMPLOYEE_TRANSFER_SCHEMA}`);
 const client={query:(...args)=>db.query(...args),release(){}};const pool={...client,connect:async()=>client};
 const profiles={hr:{login:'hr',userRoles:'HR User',site:'Nagpur'},sitehr:{login:'sitehr',userRoles:'HR User',site:'Majri OC'},officehr:{login:'officehr',userRoles:'HR User',site:'Chandrapur'},nagpur:{login:'nagpur',userRoles:'HR Manager',site:'Nagpur'},chandrapur:{login:'chandrapur',userRoles:'HR Manager',site:'Chandrapur'},pm:{login:'pm',userType:'Super User',adminLevel:'Manager',managerRole:'Project Manager',managerSites:'Majri OC'},jayant:{login:'jayant',userType:'Super User',adminLevel:'Manager',managerRole:'Project Manager',managerSites:'Jayant OC'},admin:{login:'admin',userType:'Super User',adminLevel:'Admin'},general:{login:'general',userRoles:'General User',site:'Majri OC'}};
 const sessions=Object.fromEntries(Object.entries(profiles).map(([login,user])=>{const access=resolveMobileAccess({user});return [login,{login,name:login,role:access.sessionRole,assignedRole:access.assignedRole,permissions:access.permissions}];}));
 const insert=async(master,record)=>(await db.query('INSERT INTO master_records(master_name,record_data) VALUES($1,$2) RETURNING id',[master,JSON.stringify(record)])).rows[0].id;
 for(const name of ['Majri OC','Jayant OC','Corporate Office, Nagpur','Head Office, Chandrapur','Unassigned Site'])await insert(M.site,{name});await insert(M.category,{code:'A'});
 const employee=(empId,site='Majri OC')=>insert(M.employee,{name:`EMPLOYEE ${empId}`,empId,site,category:'A',status:'ACTIVE'});
 const record=async id=>(await db.query('SELECT record_data FROM master_records WHERE id=$1',[id])).rows[0]?.record_data;
 const loadMasters=async(names,connection=client)=>{const {rows}=await connection.query('SELECT master_name,record_data FROM master_records WHERE master_name=ANY($1::text[])',[names]);return Object.fromEntries(names.map(name=>[name,rows.filter(row=>row.master_name===name).map(row=>row.record_data)]));};
 let failNotice=false;
 const app=express();app.use(express.json());const deps={pool,requireSession:(req,res,next)=>{req.session=sessions[req.get('X-User')];if(!req.session)return res.status(401).json({error:'Sign in'});next();},loadViewer:async session=>profiles[session.login],loadMasters,approverLogins:async(_,site)=>cdirApprovalRecipients(Object.values(profiles),site,resolveMobileAccess),notify:async(client,recipients,reference)=>{if(failNotice)throw Error('Notification failed');for(const recipient of recipients)await client.query('INSERT INTO notices VALUES($1,$2)',[recipient,reference]);}};
 const changes=registerCdirChanges(app,deps);registerCdirEmployeeEdit(app,{...deps,submitChange:changes.stage});registerEmployeeTransfers(app,{...deps,pmLogins:deps.approverLogins});registerCdirDeletions(app,deps);
 app.post('/api/masters/:master',deps.requireSession,changes.create);app.put('/api/masters/:master/:id',deps.requireSession,changes.update);
 app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{server.closeAllConnections();server.close();});
 const call=async(user,path,method='GET',body,reason='Correct directory details')=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/${path}`,{method,headers:{'X-User':user,'X-Audit-Reason':reason,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};};
 const edit=async(user,id,patch={},reason)=>{const before=await record(id);return call(user,`masters/${encodeURIComponent(M.employee)}/${id}`,'PUT',{before,record:{...before,...patch}},reason);};
 const decide=(user,id,site='Majri OC',action='approve',note='Checked')=>call(user,`cdir/change-requests/${id}/${action}`,'PATCH',{site,note});
 return {db,profiles,sessions,employee,insert,record,call,edit,decide,failNotices:value=>{failNotice=value;}};
}

test('profile and master edits remain pending, route by employee location, deny wrong approvers, scope and self approval',async t=>{
 const f=await fixture(t),id=await f.employee('E1');
 assert.equal((await f.call('general','cdir/change-requests')).status,403);
 assert.equal((await f.call('general',`cdir/employees/${id}/edit`)).status,403);
 const contact=await f.insert(M.contact,{name:'EMPLOYEE E1',contact:'111'});
 const editor=(await f.call('hr',`cdir/employees/${id}/edit`)).body;assert.ok(!editor.fields.some(field=>field.key==='site'));
 const pending=await f.call('hr',`cdir/employees/${id}`,'PATCH',{revision:editor.revision,record:{...editor.record,name:'CORRECTED EMPLOYEE',contact:'222'},reason:'Correct name and phone'});
 assert.equal(pending.status,202,JSON.stringify(pending.body));assert.equal((await f.record(id)).name,'EMPLOYEE E1');assert.equal((await f.record(contact)).contact,'111');
 assert.equal((await f.decide('nagpur',pending.body.id)).status,403);assert.equal((await f.decide('jayant',pending.body.id)).status,403);assert.equal((await f.decide('hr',pending.body.id)).status,403);assert.equal((await f.decide('admin',pending.body.id)).status,403);
 assert.equal((await f.edit('hr',id,{name:'ANOTHER'})).status,409);
 assert.equal((await f.call('hr','cdir/deletion-requests','POST',{master:M.employee,recordId:id,reason:'Delete'})).status,409);
 const lookup=(await f.call('hr','cdir/employee-transfers/lookup?empId=E1')).body;
 assert.equal((await f.call('hr','cdir/employee-transfers','POST',{...lookup,destination:'Jayant OC',effectiveDate:'2026-10-22'})).status,409);
 f.failNotices(true);assert.equal((await f.decide('pm',pending.body.id)).status,500);assert.equal((await f.record(id)).name,'EMPLOYEE E1');f.failNotices(false);
 assert.equal((await f.decide('pm',pending.body.id)).status,200);assert.equal((await f.record(id)).name,'CORRECTED EMPLOYEE');assert.equal((await f.record(contact)).contact,'222');assert.equal((await f.decide('pm',pending.body.id)).status,409);
 const history=(await f.call('hr','cdir/change-requests')).body.records[0];assert.equal(history.status,'Approved');assert.equal(history.changes[0].before.name,'EMPLOYEE E1');assert.equal(history.history[1].login,'pm');
 const office=await f.employee('OFFICE','Corporate Office, Nagpur');const offPending=await f.edit('hr',office,{department:'HR'});assert.equal(offPending.status,202);
 assert.equal((await f.decide('pm',offPending.body.id,'Corporate Office, Nagpur')).status,403);assert.equal((await f.decide('chandrapur',offPending.body.id,'Corporate Office, Nagpur')).status,403);
 assert.equal((await f.decide('nagpur',offPending.body.id,'Corporate Office, Nagpur')).status,200);assert.equal((await f.record(office)).department,'HR');
 assert.equal((await f.edit('sitehr',office,{department:'WRONG'})).status,403);assert.equal((await f.edit('officehr',id,{department:'WRONG'})).status,403);
 const siteRequest=await f.edit('sitehr',id,{department:'SITE HR'});assert.equal(siteRequest.status,202);assert.equal((await f.decide('pm',siteRequest.body.id,'Majri OC','reject','')).status,400);
 assert.equal((await f.decide('pm',siteRequest.body.id,'Majri OC','reject','Incorrect')).status,200);assert.notEqual((await f.record(id)).department,'SITE HR');
 const noApprover=await f.employee('NONE','Unassigned Site');assert.equal((await f.edit('hr',noApprover,{department:'HR'})).status,409);
 assert.equal((await f.edit('hr',id,{site:'Jayant OC'})).status,409);assert.equal((await f.edit('admin',id,{site:'Jayant OC'})).status,409);assert.equal((await f.edit('hr',id,{empId:'REPLACED'})).status,409);assert.equal((await f.edit('hr',id,{department:'HR'},'')).status,400);
 assert.equal((await f.call('hr',`masters/${encodeURIComponent(M.employee)}/${id}`,'PUT',{name:'OLD CLIENT'})).status,409);
 const staleBefore=await f.record(id);await f.db.query('UPDATE master_records SET record_data=record_data||$1::jsonb WHERE id=$2',[JSON.stringify({department:'NEWER'}),id]);
 assert.equal((await f.call('hr',`masters/${encodeURIComponent(M.employee)}/${id}`,'PUT',{before:staleBefore,record:{...staleBefore,name:'STALE'}})).status,409);
 const stale=await f.edit('admin',id,{department:'ADMIN PROPOSED'});assert.equal(stale.status,202);assert.equal((await f.record(id)).department,'NEWER');await f.db.query('UPDATE master_records SET record_data=record_data||$1::jsonb WHERE id=$2',[JSON.stringify({department:'CHANGED ELSEWHERE'}),id]);assert.equal((await f.decide('pm',stale.body.id)).status,409);await f.decide('pm',stale.body.id,'Majri OC','reject','Stale');
 const ownOffice=await f.edit('nagpur',office,{department:'SELF'});assert.equal(ownOffice.status,409,'Sole HR Manager cannot create a self-approved request');
 f.profiles.nagpur2={...f.profiles.nagpur,login:'nagpur2'};f.sessions.nagpur2={...f.sessions.nagpur,login:'nagpur2',name:'Independent HR Manager'};
 const independent=await f.edit('nagpur',office,{department:'SECOND REVIEW'});assert.equal(independent.status,202);
 assert.equal((await f.decide('nagpur',independent.body.id,'Corporate Office, Nagpur')).status,403);assert.equal((await f.decide('nagpur',independent.body.id,'Corporate Office, Nagpur','reject','Own request')).status,403);
 assert.equal((await f.decide('nagpur2',independent.body.id,'Corporate Office, Nagpur')).body.status,'Approved');
 const notices=(await f.db.query('SELECT * FROM notices')).rows;assert.ok(notices.some(row=>row.recipient==='pm'));assert.ok(notices.some(row=>row.recipient==='nagpur'));
});

test('multi-site imports and shared contacts require every affected location, retain records on rollback and block duplicate identities',async t=>{
 const f=await fixture(t);
 const batch=[{name:'NEW MAJRI',empId:'NEW1',site:'Majri OC',category:'A',status:'ACTIVE'},{name:'NEW OFFICE',empId:'NEW2',site:'Head Office, Chandrapur',category:'A',status:'ACTIVE'}];
 f.failNotices(true);assert.equal((await f.call('hr',`masters/${encodeURIComponent(M.employee)}`,'POST',batch)).status,500);assert.equal((await f.db.query('SELECT * FROM cdir_change_requests')).rows.length,0);f.failNotices(false);
 const submitted=await f.call('hr',`masters/${encodeURIComponent(M.employee)}`,'POST',batch);assert.equal(submitted.status,202);assert.equal((await f.db.query('SELECT * FROM master_records WHERE master_name=$1',[M.employee])).rows.length,0);
 assert.equal((await f.call('hr',`masters/${encodeURIComponent(M.employee)}`,'POST',batch)).status,409);
 assert.equal((await f.decide('pm',submitted.body.id)).body.status,'Pending');assert.equal((await f.db.query('SELECT * FROM master_records WHERE master_name=$1',[M.employee])).rows.length,0);
 assert.equal((await f.decide('chandrapur',submitted.body.id,'Head Office, Chandrapur')).body.status,'Approved');assert.equal((await f.db.query('SELECT * FROM master_records WHERE master_name=$1',[M.employee])).rows.length,2);
 assert.equal((await f.call('hr',`masters/${encodeURIComponent(M.employee)}`,'POST',batch)).status,409);
 const vacancy={name:'',empId:'',site:'Majri OC',category:'A',status:'VACANT',designation:'OPERATOR'};
 const vacancies=await f.call('hr',`masters/${encodeURIComponent(M.employee)}`,'POST',[vacancy,vacancy]);assert.equal(vacancies.status,202);
 assert.equal((await f.decide('pm',vacancies.body.id)).body.status,'Approved');
 assert.equal((await f.db.query("SELECT * FROM master_records WHERE master_name=$1 AND record_data->>'status'='VACANT'",[M.employee])).rows.length,2);
 const shared1=await f.employee('SHARED','Majri OC');await f.employee('SHARED','Jayant OC');const contact=await f.insert(M.contact,{empId:'SHARED',name:'EMPLOYEE SHARED',contact:'111'});const before=await f.record(contact);
 const payload={before,record:{...before,contact:'333'}};
 assert.equal((await f.call('sitehr',`masters/${encodeURIComponent(M.contact)}/${contact}`,'PUT',payload)).status,403);
 const shared=await f.call('hr',`masters/${encodeURIComponent(M.contact)}/${contact}`,'PUT',payload);assert.equal(shared.status,202);
 assert.equal((await f.decide('pm',shared.body.id)).body.status,'Pending');assert.equal((await f.record(contact)).contact,'111');
 assert.equal((await f.decide('jayant',shared.body.id,'Jayant OC')).body.status,'Approved');assert.equal((await f.record(contact)).contact,'333');assert.equal((await f.record(shared1)).site,'Majri OC');
 const invalid=await f.call('hr',`masters/${encodeURIComponent(M.employee)}`,'POST',[{...batch[0],empId:'INVALID',adminLevel:'Admin'}]);assert.equal(invalid.status,400);
 const pending=await f.edit('hr',shared1,{department:'WAITING'});delete f.profiles.pm;assert.equal((await f.decide('pm',pending.body.id)).status,403);
});

test('approval policy covers server bypasses, normal and mobile UI, deployment roster replacement and independent site scope',()=>{
 assert.equal(cdirSubmissionAllowed({assignedRole:'HR User'},{site:'Nagpur'},'Jayant OC'),true);
 assert.equal(cdirSubmissionAllowed({assignedRole:'HR User'},{site:'Majri OC'},'Jayant OC'),false);
 const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
 for(const [route,gate]of [["app.post('/api/masters/:master'",'return cdirChanges.create(req,res,next)'],["app.put('/api/masters/:master/:id'",'return cdirChanges.update(req,res,next)'],["app.delete('/api/masters/:master/:id'",'return requestCdirDeletion(req,res,next)']]){const section=server.slice(server.indexOf(route));assert.ok(section.indexOf(gate)>=0);assert.ok(section.indexOf(gate)<section.indexOf('UPDATE master_records')||section.indexOf('UPDATE master_records')===-1);}
 assert.ok(server.includes('if(deletionProtectedMaster(master))return res.status(403)'));
 assert.ok(server.includes('if(isCdirMaster(master)&&await cdirReferenceCount(master,previousRecord))return res.status(409)'));
 const profile=readFileSync(new URL('../cdir-employee-edit.mjs',import.meta.url),'utf8');assert.ok(!profile.includes('UPDATE master_records'));assert.ok(profile.includes('submitChange(client,req,changes,req.body.reason)'));
 const ui=readFileSync(new URL('../src/cdir-employee-edit.jsx',import.meta.url),'utf8');assert.ok(ui.includes('Submit for approval'));assert.ok(ui.includes('reason'));
 for(const file of ['src/main.jsx','src/employee-transfer.jsx'])assert.ok(readFileSync(new URL('../'+file,import.meta.url),'utf8').includes('Directory Update Approvals'));
 const roster=readFileSync(new URL('../cdir-roster-import.mjs',import.meta.url),'utf8');assert.ok(roster.includes('Existing directory records cannot be replaced through deployment configuration'));
});
