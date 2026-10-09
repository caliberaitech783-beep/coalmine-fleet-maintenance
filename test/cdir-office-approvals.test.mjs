import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {CDIR_MASTERS} from '../cdir-masters.mjs';
import {CDIR_DELETION_SCHEMA,registerCdirDeletions,cdirDirectAdministrator,deletionProtectedMaster} from '../cdir-deletion.mjs';
import {EMPLOYEE_TRANSFER_SCHEMA,registerEmployeeTransfers,employeeTransferAccess,employeeTransferSiteAllowed} from '../employee-transfer.mjs';
import {officeApprovalKey,cdirApprovalRecipients} from '../cdir-approval-routing.mjs';
import {resolveMobileAccess,normalizeMobileUserRole} from '../mobile-access.mjs';
import {cdirViewerContext} from '../cdir-access.mjs';
import {canEditCdirEmployee} from '../cdir-employee-edit.mjs';

const profiles={
 hr:{login:'hr',userRoles:'HR User',site:'Nagpur'},
 nagpur:{login:'nagpur',userRoles:'HR Manager',site:'Nagpur'},
 chandrapur:{login:'chandrapur',userRoles:'HR Manager',site:'Chandrapur'},
 pm:{login:'pm',userType:'Super User',adminLevel:'Manager',managerRole:'Project Manager',managerSites:'Majri OC | Corporate Office, Nagpur'},
 other:{login:'other',userType:'Super User',adminLevel:'Manager',managerRole:'Project Manager',managerSites:'Jayant OC'},
 general:{login:'general',userRoles:'General User'},
 admin:{login:'admin',userType:'Super User',adminLevel:'Admin'},
};
const sessions=Object.fromEntries(Object.entries(profiles).map(([key,user])=>{const access=resolveMobileAccess({user});return [key,{login:key,name:key,role:access.sessionRole,assignedRole:access.assignedRole,permissions:access.permissions}];}));

test('HR Manager grants directory privileges and office aliases without fleet access or cross-office approval',()=>{
 assert.equal(normalizeMobileUserRole('hr manager'),'HR Manager');
 const access=resolveMobileAccess({user:profiles.nagpur,selectedRole:'HR Manager'});
 assert.equal(access.assignedRole,'HR Manager');assert.equal(access.permissions.hrDirectoryMasters,true);assert.equal(access.permissions.createRequests,false);
 assert.equal(canEditCdirEmployee(sessions.nagpur,profiles.nagpur),true);
 const viewer=cdirViewerContext({session:sessions.nagpur,user:profiles.nagpur,sites:[{id:'nagpur',label:'Corporate Office, Nagpur'},{id:'chandrapur',label:'Head Office, Chandrapur'}]});
 assert.equal(viewer.canViewAContacts,true);assert.deepEqual(viewer.siteIds,['nagpur']);
 for(const site of ['Nagpur','Nagpur office','Corporate Office, Nagpur'])assert.equal(officeApprovalKey(site),'nagpur');
 for(const site of ['Chandrapur','Chandrapur head office','Head Office, Chandrapur'])assert.equal(officeApprovalKey(site),'chandrapur');
 const users=Object.values(profiles);
 assert.deepEqual(cdirApprovalRecipients(users,'Corporate Office, Nagpur',resolveMobileAccess),['nagpur']);
 assert.deepEqual(cdirApprovalRecipients(users,'Head Office, Chandrapur',resolveMobileAccess),['chandrapur']);
 assert.deepEqual(cdirApprovalRecipients(users,'Majri OC',resolveMobileAccess),['pm']);
 assert.equal(employeeTransferSiteAllowed(employeeTransferAccess(sessions.pm,profiles.pm),'Nagpur'),false);
 assert.equal(employeeTransferSiteAllowed(employeeTransferAccess(sessions.nagpur,profiles.nagpur),'Chandrapur'),false);
 assert.equal(employeeTransferSiteAllowed(employeeTransferAccess(sessions.nagpur,profiles.nagpur),'Majri OC'),false);
 assert.equal(cdirDirectAdministrator(sessions.admin),true);assert.equal(cdirDirectAdministrator(sessions.nagpur),false);
 assert.equal(deletionProtectedMaster(CDIR_MASTERS.employee),true);assert.equal(deletionProtectedMaster('Equipment master'),false);
});

test('real HTTP office/site approvals and employee/contact deletion retain history, enforce scope and roll back failed notifications',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE master_records(id SERIAL PRIMARY KEY,master_name TEXT,record_data JSONB);CREATE TABLE notices(recipient TEXT,reference TEXT);${EMPLOYEE_TRANSFER_SCHEMA}${CDIR_DELETION_SCHEMA}`);
 const client={query:(...args)=>db.query(...args),release(){}};const pool={...client,connect:async()=>client};
 const insert=async(master,record)=>(await db.query('INSERT INTO master_records(master_name,record_data) VALUES($1,$2) RETURNING id',[master,JSON.stringify(record)])).rows[0].id;
 const employee=async(empId,site='Corporate Office, Nagpur')=>insert(CDIR_MASTERS.employee,{name:`EMPLOYEE ${empId}`,empId,site,category:'A1',status:'ACTIVE'});
 const exists=async id=>(await db.query('SELECT * FROM master_records WHERE id=$1',[id])).rows.length===1;
 for(const name of ['Corporate Office, Nagpur','Head Office, Chandrapur','Majri OC'])await insert(CDIR_MASTERS.site,{name});await insert(CDIR_MASTERS.category,{code:'A1'});
 let failNotice=false;
 const app=express();app.use(express.json());
 const deps={pool,requireSession:(req,res,next)=>{req.session=sessions[req.headers['x-user']];if(!req.session)return res.status(401).json({error:'Sign in'});next();},loadViewer:async session=>profiles[session.login],approverLogins:async(_,site)=>cdirApprovalRecipients(Object.values(profiles),site,resolveMobileAccess),notify:async(client,recipients,reference)=>{if(failNotice)throw Error('Notification failure');for(const recipient of recipients)await client.query('INSERT INTO notices VALUES($1,$2)',[recipient,reference]);}};
 registerCdirDeletions(app,deps);
 registerEmployeeTransfers(app,{...deps,pmLogins:deps.approverLogins,loadMasters:async(names,connection=client)=>{const {rows}=await connection.query('SELECT master_name,record_data FROM master_records WHERE master_name=ANY($1::text[])',[names]);return Object.fromEntries(names.map(name=>[name,rows.filter(r=>r.master_name===name).map(r=>r.record_data)]));}});
 app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{server.closeAllConnections();server.close();});
 const call=async(user,path,method='GET',body)=>{const res=await fetch(`http://127.0.0.1:${server.address().port}/api/cdir/${path}`,{method,headers:{'x-user':user,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,body:await res.json()};};
 const deletion=(user,id,master=CDIR_MASTERS.employee)=>call(user,'deletion-requests','POST',{master,recordId:id,reason:'Duplicate placement'});
 const decide=(user,id,action='approve',note='Reviewed')=>call(user,`deletion-requests/${id}/${action}`,'PATCH',{note});
 assert.equal((await call('general','deletion-requests')).status,403);
 const officeId=await employee('OFFICE1');
 const lookup=(await call('hr','employee-transfers/lookup?empId=OFFICE1')).body;
 const transfer={...lookup,destination:'Majri OC',effectiveDate:'2026-10-09',remarks:'New assignment'};
 const sent=await call('hr','employee-transfers','POST',transfer);assert.equal(sent.status,201,JSON.stringify(sent.body));
 assert.equal((await deletion('hr',officeId)).status,409);
 assert.equal((await call('pm',`employee-transfers/${sent.body.id}/approve`,'PATCH',{})).status,403);
 assert.equal((await call('chandrapur',`employee-transfers/${sent.body.id}/approve`,'PATCH',{})).status,403);
 assert.equal((await call('nagpur',`employee-transfers/${sent.body.id}/approve`,'PATCH',{})).status,200);
 assert.equal((await db.query('SELECT record_data FROM master_records WHERE id=$1',[officeId])).rows[0].record_data.site,'Corporate Office, Nagpur');
 assert.equal((await call('pm',`employee-transfers/${sent.body.id}/accept`,'PATCH',{})).status,200);
 const back=(await call('hr','employee-transfers/lookup?empId=OFFICE1')).body;
 const returning=await call('hr','employee-transfers','POST',{...back,destination:'Head Office, Chandrapur',effectiveDate:'2026-10-10'});assert.equal(returning.status,201,JSON.stringify(returning.body));
 await call('pm',`employee-transfers/${returning.body.id}/approve`,'PATCH',{});
 assert.equal((await call('nagpur',`employee-transfers/${returning.body.id}/accept`,'PATCH',{})).status,403);
 assert.equal((await call('chandrapur',`employee-transfers/${returning.body.id}/accept`,'PATCH',{})).status,200);
 const id=await employee('DELETE1');failNotice=true;
 assert.equal((await deletion('hr',id)).status,500);assert.equal((await db.query('SELECT * FROM cdir_deletion_requests')).rows.length,0);failNotice=false;
 const pending=await deletion('hr',id);assert.equal(pending.status,202);assert.equal(await exists(id),true);
 assert.equal((await deletion('hr',id)).status,409);
 const pendingLookup=(await call('hr','employee-transfers/lookup?empId=DELETE1')).body;
 assert.equal((await call('hr','employee-transfers','POST',{...pendingLookup,destination:'Majri OC',effectiveDate:'2026-10-09'})).status,409);
 assert.equal((await decide('pm',pending.body.id)).status,403);assert.equal((await decide('chandrapur',pending.body.id)).status,403);assert.equal((await decide('admin',pending.body.id)).status,403);
 failNotice=true;assert.equal((await decide('nagpur',pending.body.id)).status,500);assert.equal(await exists(id),true);failNotice=false;
 assert.equal((await decide('nagpur',pending.body.id)).status,200);assert.equal(await exists(id),false);assert.equal((await decide('nagpur',pending.body.id)).status,409);
 const approved=(await call('hr','deletion-requests')).body.records.find(r=>r.id===pending.body.id);assert.equal(approved.record.empId,'DELETE1');assert.equal(approved.status,'Approved');assert.deepEqual(approved.history.map(r=>r.action),['Requested','Approved']);assert.equal(approved.decidedBy,'nagpur');
 const staleId=await employee('STALE1');const stale=await deletion('hr',staleId);await db.query('UPDATE master_records SET record_data=record_data||$1::jsonb WHERE id=$2',[JSON.stringify({designation:'Changed'}),staleId]);assert.equal((await decide('nagpur',stale.body.id)).status,409);
 assert.equal((await decide('nagpur',stale.body.id,'reject','')).status,400);assert.equal((await decide('nagpur',stale.body.id,'reject')).status,200);assert.equal(await exists(staleId),true);
 const siteId=await employee('SITE1','Majri OC');const sitePending=await deletion('hr',siteId);assert.equal(sitePending.status,202);assert.equal((await decide('nagpur',sitePending.body.id)).status,403);assert.equal((await decide('pm',sitePending.body.id)).status,200);
 const contactEmployee=await employee('CONTACT1','Head Office, Chandrapur');const contactId=await insert(CDIR_MASTERS.contact,{empId:'CONTACT1',name:'EMPLOYEE CONTACT1',contact:'1234567890'});
 const contactPending=await deletion('hr',contactId,CDIR_MASTERS.contact);assert.equal(contactPending.status,202);assert.equal((await decide('chandrapur',contactPending.body.id)).status,200);assert.equal(await exists(contactId),false);assert.equal(await exists(contactEmployee),true);
 const orphan=await insert(CDIR_MASTERS.contact,{empId:'MISSING',name:'ORPHAN'});assert.equal((await deletion('hr',orphan,CDIR_MASTERS.contact)).status,409);
 const notices=(await db.query('SELECT * FROM notices')).rows;assert.ok(notices.some(r=>r.recipient==='nagpur'));assert.ok(notices.some(r=>r.recipient==='chandrapur'));assert.ok(notices.some(r=>r.recipient==='pm'));
 const outOfScope=(await call('other','deletion-requests')).body;assert.equal(outOfScope.records.length,0);assert.equal(outOfScope.targets.length,0);
});

test('all nonadmin single and bulk master deletions are intercepted before direct delete',()=>{
 const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
 const route=source.slice(source.indexOf("app.delete('/api/masters/:master/:id'"));
 assert.ok(route.indexOf('return requestCdirDeletion(req,res,next)')<route.indexOf('DELETE FROM master_records'));
 assert.ok(source.includes("if(deletionProtectedMaster(master)&&!cdirDirectAdministrator(req.session))return res.status(403)"));
 const ui=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.ok(ui.includes('response.status===202'));assert.ok(ui.includes('deletionApprovalRequired ? "Request deletion"'));
});
