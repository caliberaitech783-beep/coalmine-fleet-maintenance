import {randomUUID,createHash} from 'node:crypto';
import {canEditCdirEmployee,CDIR_EDIT_FIELDS} from './cdir-employee-edit.mjs';
import {CDIR_MASTERS,cdirNormalizeRecord,cdirEmployeeError} from './cdir-masters.mjs';
import {managerRoleSelection} from './admin-access.mjs';
import {managerReportScope,reportScopeIncludesSite} from './region-scope.mjs';
import {canonicalSiteName} from './site-location.mjs';
import {assignedUserRoles} from './account-role-access.mjs';
import {approvalRoleForSite,officeApprovalKey,hrManagerAssignedToOffice} from './cdir-approval-routing.mjs';

export const EMPLOYEE_TRANSFER_SCHEMA=`CREATE TABLE IF NOT EXISTS employee_transfers(id BIGSERIAL PRIMARY KEY,record_data JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); CREATE INDEX IF NOT EXISTS employee_transfers_employee_idx ON employee_transfers ((record_data->>'employeeRecordId')); CREATE UNIQUE INDEX IF NOT EXISTS employee_transfers_reference_idx ON employee_transfers ((record_data->>'transferNo')); CREATE UNIQUE INDEX IF NOT EXISTS employee_transfers_pending_idx ON employee_transfers ((record_data->>'employeeRecordId')) WHERE record_data->>'status' IN ('Awaiting source approval','Awaiting destination acceptance');`;
export const ET_STATUS={OUT:'Awaiting source approval',IN:'Awaiting destination acceptance',DONE:'Completed',REJECTED:'Rejected'};
const contacts=['contact','whatsapp','emergencyContact','email'];
const fields=CDIR_EDIT_FIELDS.filter(([key])=>!['site','status'].includes(key));
const allowed=new Set(fields.map(([key])=>key));
const clean=v=>String(v??'').trim();
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const hash=(employee,contact)=>createHash('sha256').update(JSON.stringify([employee,contact])).digest('hex');
export function employeeTransferAccess(session={},user={}){
  const roles=managerRoleSelection(user.managerRoles||user.managerRole||session.permissions?.managerRoles||session.permissions?.managerRole);
  const pm=session.role==='super'&&roles.includes('Project Manager')&&clean(user.adminLevel||session.permissions?.adminLevel).toLowerCase()==='manager';
  const privileged=canEditCdirEmployee(session,user);
  const hrManager=assignedUserRoles(user).includes('HR Manager')||session.assignedRole==='HR Manager';
  return {privileged,pm,hrManager,user,canSubmit:privileged||pm||hrManager,scope:managerReportScope(user)};
}
export const employeeTransferSiteAllowed=(context,site)=>officeApprovalKey(site)?context.hrManager&&hrManagerAssignedToOffice(context.user,site):context.pm&&reportScopeIncludesSite(context.scope,site);
export const employeeTransferVisible=(record,context)=>context.privileged||[record.source,record.destination].some(site=>employeeTransferSiteAllowed(context,site));
async function employeeRecord(db,id){
  const {rows}=await db.query('SELECT id,record_data FROM master_records WHERE master_name=$1 AND id=$2 FOR UPDATE',[CDIR_MASTERS.employee,id]);
  if(!rows.length)fail(404,'Employee no longer exists.');
  const employee=rows[0].record_data;
  if(!clean(employee.empId))fail(400,'Assign an employee ID in Masters before requesting a transfer.');
  const identities=await db.query(`SELECT id FROM master_records WHERE master_name=$1 AND lower(trim(record_data->>'empId'))=lower($2)`,[CDIR_MASTERS.employee,clean(employee.empId)]);
  if(identities.rows.length!==1)fail(409,'This employee ID has multiple placements. Reconcile the records in Masters first.');
  const matches=await db.query(`SELECT id,record_data FROM master_records WHERE master_name=$1 AND (lower(trim(record_data->>'empId'))=lower($2) OR (coalesce(trim(record_data->>'empId'),'')='' AND lower(trim(record_data->>'name'))=lower($3))) ORDER BY id FOR UPDATE`,[CDIR_MASTERS.contact,clean(employee.empId),clean(employee.name)]);
  if(matches.rows.length>1)fail(409,'Multiple contact records match this employee. Reconcile them in Masters first.');
  return {employee,contact:matches.rows[0]||null};
}
function validateDetails(record){
  if(!record||typeof record!=='object'||Array.isArray(record)||Object.keys(record).some(key=>!allowed.has(key)))fail(400,'Invalid employee details.');
  for(const value of Object.values(record))if(typeof value!=='string'||value.length>500)fail(400,'Employee details must be text of at most 500 characters.');
  for(const key of ['dob','doj'])if(record[key]&&(!/^\d{4}-\d{2}-\d{2}$/.test(record[key])||!Number.isFinite(Date.parse(record[key]))||new Date(record[key]).toISOString().slice(0,10)!==record[key]))fail(400,'Enter valid employee dates.');
}
export function registerEmployeeTransfers(app,{pool,requireSession,loadViewer,loadMasters,pmLogins,notify}){
  const context=async req=>employeeTransferAccess(req.session,await loadViewer(req.session));
  app.get('/api/cdir/employee-transfer-access',requireSession,async(req,res,next)=>{try{res.set('Cache-Control','no-store');res.json({allowed:(await context(req)).canSubmit});}catch(error){next(error);}});
  const authorize=async req=>{const ctx=await context(req);if(!ctx.canSubmit)fail(403,'Employee transfers are available only to HR, directors, administrators and Project Managers.');return ctx;};
  const masters=client=>loadMasters(Object.values(CDIR_MASTERS).filter(name=>![CDIR_MASTERS.employee,CDIR_MASTERS.contact].includes(name)),client);
  const options=values=>fields.map(([key,label,type='text'])=>({key,label,type,options:type.startsWith('ref:')?(values[type.split(':')[1]]||[]).map(row=>row[type.split(':')[2]]).filter(Boolean):type.startsWith('options:')?type.slice(8).split('|'):undefined}));
  const route=(handler,transaction=false)=>async(req,res,next)=>{
    let client;try{const ctx=await authorize(req);client=transaction?await pool.connect():pool;if(transaction){await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtext('cdir-employee-edit'))");}const result=await handler(req,ctx,client);if(transaction)await client.query('COMMIT');res.set('Cache-Control','no-store');res.status(result.status||200).json(result.body);}catch(error){if(transaction&&client)await client.query('ROLLBACK').catch(()=>{});next(error);}finally{if(transaction)client?.release();}
  };
  app.get('/api/cdir/employee-transfers',requireSession,route(async(req,ctx,client)=>{
    const {rows}=await client.query('SELECT id,record_data FROM employee_transfers ORDER BY created_at DESC,id DESC');
    const values=await masters(client);
    return {body:{sites:(values[CDIR_MASTERS.site]||[]).map(row=>row.name),capabilities:{canSubmit:ctx.canSubmit,projectManager:ctx.pm},records:rows.map(row=>({id:row.id,...row.record_data})).filter(row=>employeeTransferVisible(row,ctx)).map(row=>({...row,outgoing:ctx.privileged||employeeTransferSiteAllowed(ctx,row.source),incoming:ctx.privileged||employeeTransferSiteAllowed(ctx,row.destination),canApprove:row.status===ET_STATUS.OUT&&employeeTransferSiteAllowed(ctx,row.source),canAccept:row.status===ET_STATUS.IN&&employeeTransferSiteAllowed(ctx,row.destination)}))}};
  }));
  app.get('/api/cdir/employee-transfers/lookup',requireSession,route(async(req,ctx,client)=>{
    const empId=clean(req.query.empId);if(!empId||empId.length>80)fail(400,'Enter an employee ID.');
    const {rows}=await client.query(`SELECT id,record_data FROM master_records WHERE master_name=$1 AND lower(trim(record_data->>'empId'))=lower($2)`,[CDIR_MASTERS.employee,empId]);
    if(!rows.length)fail(404,'No employee found for this ID.');if(rows.length!==1)fail(409,'This employee ID has multiple placements. Reconcile the records in Masters first.');
    const {employee,contact}=await employeeRecord(client,rows[0].id);
    if(!ctx.privileged&&!employeeTransferSiteAllowed(ctx,employee.site))fail(403,'You can request transfers only from your assigned sites.');
    if(clean(employee.status||'ACTIVE').toUpperCase()!=='ACTIVE')fail(400,'Only active employees can be transferred.');
    const values=await masters(client);
    return {body:{employeeRecordId:rows[0].id,empId:employee.empId,source:employee.site,revision:hash(employee,contact),fields:options(values),record:Object.fromEntries(fields.map(([key])=>[key,contacts.includes(key)?contact?.record_data[key]||'':employee[key]||'']))}};
  }));
  app.post('/api/cdir/employee-transfers',requireSession,route(async(req,ctx,client)=>{
    const input=req.body||{};validateDetails(input.record);if(!/^\d+$/.test(String(input.employeeRecordId)))fail(400,'Look up an employee before submitting.');
    const {employee,contact}=await employeeRecord(client,input.employeeRecordId);
    if(input.revision!==hash(employee,contact))fail(409,'Employee details changed. Look up the ID again.');
    if(!ctx.privileged&&!employeeTransferSiteAllowed(ctx,employee.site))fail(403,'Source site is outside your assigned locations.');
    if(clean(employee.status||'ACTIVE').toUpperCase()!=='ACTIVE')fail(400,'Only active employees can be transferred.');
    const values=await masters(client),destination=(values[CDIR_MASTERS.site]||[]).find(site=>canonicalSiteName(site.name)===canonicalSiteName(input.destination))?.name;
    if(!destination||canonicalSiteName(destination)===canonicalSiteName(employee.site))fail(400,'Select a different destination from the Site & Office master.');
    const effectiveDate=clean(input.effectiveDate);if(!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)||!Number.isFinite(Date.parse(effectiveDate))||new Date(effectiveDate).toISOString().slice(0,10)!==effectiveDate)fail(400,'Enter a valid transfer date.');
    const proposed=cdirNormalizeRecord(CDIR_MASTERS.employee,{...employee,...Object.fromEntries(Object.entries(input.record).filter(([key])=>!contacts.includes(key))),site:destination});
    const error=cdirEmployeeError(proposed,values);if(error)fail(400,error);
    const pending=await client.query(`SELECT id FROM employee_transfers WHERE record_data->>'employeeRecordId'=$1 AND record_data->>'status'=ANY($2::text[])`,[String(input.employeeRecordId),[ET_STATUS.OUT,ET_STATUS.IN]]);if(pending.rows.length)fail(409,'This employee already has a pending transfer.');
    const deletion=await client.query("SELECT id FROM cdir_deletion_requests WHERE record_data->>'employeeRecordId'=$1 AND record_data->>'status'='Pending'",[String(input.employeeRecordId)]);if(deletion.rows.length)fail(409,'Complete or reject the pending deletion request first.');
    const sourceManagers=await pmLogins(client,employee.site),destinationManagers=await pmLogins(client,destination);
    if(!sourceManagers.length||!destinationManagers.length)fail(400,`Assign a ${approvalRoleForSite(employee.site)} at ${employee.site} and a ${approvalRoleForSite(destination)} at ${destination} before creating this request.`);
    const at=new Date().toISOString(),by=req.session.name||req.session.login;
    const record={transferNo:`ET-${Date.now()}-${randomUUID().slice(0,4).toUpperCase()}`,employeeRecordId:String(input.employeeRecordId),empId:employee.empId,name:proposed.name,source:employee.site,destination,effectiveDate,remarks:clean(input.remarks).slice(0,2000),status:ET_STATUS.OUT,submittedBy:by,submittedLogin:req.session.login,submittedAt:at,sourceManagers,destinationManagers,sourceApproverRole:approvalRoleForSite(employee.site),destinationApproverRole:approvalRoleForSite(destination),before:employee,beforeContact:contact,revision:hash(employee,contact),proposed,proposedContact:{...(contact?.record_data||{}),name:proposed.name,empId:employee.empId,...Object.fromEntries(contacts.map(key=>[key,clean(input.record[key]??contact?.record_data[key])]))},history:[{action:'Requested',by,login:req.session.login,at,note:clean(input.remarks).slice(0,2000)}]};
    const saved=await client.query('INSERT INTO employee_transfers(record_data) VALUES($1::jsonb) RETURNING id',[JSON.stringify(record)]);
    await notify(client,sourceManagers,record.transferNo,`Employee transfer OUT: ${record.empId} ${record.name}, ${record.source} → ${destination}. Source approval required.`);
    await notify(client,destinationManagers,record.transferNo,`Employee transfer IN: ${record.empId} ${record.name}, ${record.source} → ${destination}. Awaiting source approval.`);
    req.audit={eventType:'Employee transfer',module:'C-Dir',action:'Request employee transfer',targetReference:record.transferNo};
    return {status:201,body:{id:saved.rows[0].id,transferNo:record.transferNo}};
  },true));
  app.patch('/api/cdir/employee-transfers/:id/:action',requireSession,route(async(req,ctx,client)=>{
    if(!/^\d+$/.test(req.params.id))fail(400,'Invalid transfer ID.');
    const {rows}=await client.query('SELECT record_data FROM employee_transfers WHERE id=$1 FOR UPDATE',[req.params.id]);const record=rows[0]?.record_data;if(!record)fail(404,'Transfer not found.');
    const action=req.params.action,sourceStage=record.status===ET_STATUS.OUT,destinationStage=record.status===ET_STATUS.IN;
    if(!sourceStage&&!destinationStage)fail(409,'This request is already finalized.');
    if(!employeeTransferSiteAllowed(ctx,sourceStage?record.source:record.destination))fail(403,'Only the assigned location approver can act on this stage.');
    if(!['approve','accept','reject'].includes(action)||action==='approve'&&!sourceStage||action==='accept'&&!destinationStage)fail(409,'This action does not match the current transfer stage.');
    const note=clean(req.body?.note).slice(0,2000);if(action==='reject'&&!note)fail(400,'Enter a reason for rejection.');
    const at=new Date().toISOString(),by=req.session.name||req.session.login;
    if(action==='accept'){
      const {employee,contact}=await employeeRecord(client,record.employeeRecordId);
      if(record.revision!==hash(employee,contact))fail(409,'Employee details changed after submission. Reject and recreate this request using current details.');
      const error=cdirEmployeeError(record.proposed,await masters(client));if(error)fail(409,error);
      await client.query('UPDATE master_records SET record_data=$1::jsonb WHERE id=$2 AND master_name=$3',[JSON.stringify(record.proposed),record.employeeRecordId,CDIR_MASTERS.employee]);
      if(contact)await client.query('UPDATE master_records SET record_data=$1::jsonb WHERE id=$2 AND master_name=$3',[JSON.stringify(record.proposedContact),contact.id,CDIR_MASTERS.contact]);
      else if(contacts.some(key=>record.proposedContact[key]))await client.query('INSERT INTO master_records(master_name,record_data) VALUES($1,$2::jsonb)',[CDIR_MASTERS.contact,JSON.stringify(record.proposedContact)]);
      record.status=ET_STATUS.DONE;record.acceptedBy=by;record.acceptedAt=at;
    }else if(action==='approve'){record.status=ET_STATUS.IN;record.approvedBy=by;record.approvedAt=at;}
    else{record.status=ET_STATUS.REJECTED;record.rejectedBy=by;record.rejectedAt=at;record.rejectionReason=note;}
    record.history.push({action:action==='accept'?'Accepted':action==='approve'?'Source approved':'Rejected',by,login:req.session.login,at,note});
    await client.query('UPDATE employee_transfers SET record_data=$1::jsonb WHERE id=$2',[JSON.stringify(record),req.params.id]);
    await notify(client,[record.submittedLogin,...record.sourceManagers,...record.destinationManagers],record.transferNo,`Employee transfer ${record.transferNo}: ${record.status}. ${record.empId} ${record.source} → ${record.destination}.`);
    req.audit={eventType:'Employee transfer',module:'C-Dir',action:record.history.at(-1).action,targetReference:record.transferNo};
    return {body:{ok:true,status:record.status}};
  },true));
}
