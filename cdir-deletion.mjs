import {randomUUID,createHash} from 'node:crypto';
import {CDIR_MASTERS} from './cdir-masters.mjs';
import {employeeTransferAccess,employeeTransferSiteAllowed} from './employee-transfer.mjs';
import {approvalRoleForSite} from './cdir-approval-routing.mjs';
export const CDIR_DELETION_SCHEMA=`CREATE TABLE IF NOT EXISTS cdir_deletion_requests(id BIGSERIAL PRIMARY KEY,record_data JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); CREATE UNIQUE INDEX IF NOT EXISTS cdir_deletion_pending_idx ON cdir_deletion_requests ((record_data->>'master'),(record_data->>'recordId')) WHERE record_data->>'status'='Pending';`;
export const deletionProtectedMaster=name=>[CDIR_MASTERS.employee,CDIR_MASTERS.contact].includes(name);
export const cdirDirectAdministrator=session=>session?.role==='super'&&['admin','super admin'].includes(String(session.permissions?.adminLevel||'').trim().toLowerCase());
const hash=record=>createHash('sha256').update(JSON.stringify(record)).digest('hex');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
async function target(client,master,id){
 if(!deletionProtectedMaster(master)||!/^\d+$/.test(String(id)))fail(400,'Select a C-Directory employee or contact record.');
 const {rows}=await client.query('SELECT record_data FROM master_records WHERE master_name=$1 AND id=$2 FOR UPDATE',[master,id]);if(!rows.length)fail(404,'Record not found.');
 const record=rows[0].record_data;let employee={id:String(id),record_data:record};
 if(master===CDIR_MASTERS.contact){
  const {rows:employees}=await client.query(`SELECT id,record_data FROM master_records WHERE master_name=$1 AND (CASE WHEN $2<>'' THEN lower(trim(record_data->>'empId'))=lower($2) ELSE lower(trim(record_data->>'name'))=lower($3) END) FOR UPDATE`,[CDIR_MASTERS.employee,String(record.empId||'').trim(),String(record.name||'').trim()]);
  if(employees.length!==1)fail(409,'The contact must match one employee/location. Reconcile this record in Masters before requesting deletion.');employee=employees[0];
 }
 if(!employee.record_data.site)fail(409,'Assign a location before requesting deletion.');
 return {master,recordId:String(id),record,employeeRecordId:String(employee.id),site:employee.record_data.site,name:record.name||employee.record_data.name,empId:record.empId||employee.record_data.empId||'',revision:hash(record)};
}
export function registerCdirDeletions(app,{pool,requireSession,loadViewer,approverLogins,notify}){
 const context=async req=>{const ctx=employeeTransferAccess(req.session,await loadViewer(req.session));if(!ctx.canSubmit)fail(403,'Only HR, directors, administrators and assigned managers can request deletion.');return ctx;};
 const visible=(record,ctx)=>ctx.privileged||employeeTransferSiteAllowed(ctx,record.site);
 const wrap=handler=>async(req,res,next)=>{let client;try{const ctx=await context(req);client=await pool.connect();await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtext('cdir-employee-edit'))");const result=await handler(req,ctx,client);await client.query('COMMIT');res.set('Cache-Control','no-store');res.status(result.status||200).json(result.body);}catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});next(error);}finally{client?.release();}};
 app.get('/api/cdir/deletion-requests',requireSession,async(req,res,next)=>{try{
  const ctx=await context(req);const {rows}=await pool.query('SELECT id,record_data FROM cdir_deletion_requests ORDER BY created_at DESC,id DESC');
  const {rows:masterRows}=await pool.query('SELECT id,master_name,record_data FROM master_records WHERE master_name=ANY($1::text[]) ORDER BY id',[[CDIR_MASTERS.employee,CDIR_MASTERS.contact]]);
  const targets=[];for(const row of masterRows){let employee=row;
   if(row.master_name===CDIR_MASTERS.contact){const candidates=masterRows.filter(e=>e.master_name===CDIR_MASTERS.employee&&(row.record_data.empId?String(e.record_data.empId||'').trim().toLowerCase()===String(row.record_data.empId).trim().toLowerCase():String(e.record_data.name||'').trim().toLowerCase()===String(row.record_data.name||'').trim().toLowerCase()));if(candidates.length!==1)continue;employee=candidates[0];}
   const site=employee.record_data.site;if(site&&visible({site},ctx))targets.push({id:row.id,master:row.master_name,name:row.record_data.name,empId:row.record_data.empId||employee.record_data.empId,site});
  }
  res.set('Cache-Control','no-store');res.json({targets,records:rows.map(row=>({id:row.id,...row.record_data})).filter(record=>visible(record,ctx)).map(record=>({...record,canApprove:record.status==='Pending'&&employeeTransferSiteAllowed(ctx,record.site)}))});
 }catch(error){next(error);}});
 const create=wrap(async(req,ctx,client)=>{
  const input=req.body||{},reason=String(input.reason||'').trim();if(!reason||reason.length>2000)fail(400,'Enter a deletion reason of at most 2,000 characters.');
  const current=await target(client,input.master,input.recordId);if(!visible(current,ctx))fail(403,'This record is outside your assigned locations.');
  const pending=await client.query(`SELECT id FROM cdir_deletion_requests WHERE record_data->>'employeeRecordId'=$1 AND record_data->>'status'='Pending'`,[current.employeeRecordId]);if(pending.rows.length)fail(409,'This employee already has a pending deletion request.');
  const transfer=await client.query(`SELECT id FROM employee_transfers WHERE record_data->>'employeeRecordId'=$1 AND record_data->>'status'=ANY($2::text[])`,[current.employeeRecordId,['Awaiting source approval','Awaiting destination acceptance']]);if(transfer.rows.length)fail(409,'Complete or reject this employee’s pending transfer first.');
  const recipients=await approverLogins(client,current.site);if(!recipients.length)fail(400,`Assign an ${approvalRoleForSite(current.site)} to ${current.site} before requesting deletion.`);
  const at=new Date().toISOString(),by=req.session.name||req.session.login;
  const record={...current,requestNo:`CD-DEL-${Date.now()}-${randomUUID().slice(0,4).toUpperCase()}`,status:'Pending',reason,approverRole:approvalRoleForSite(current.site),recipients,requestedBy:by,requestedLogin:req.session.login,requestedAt:at,history:[{action:'Requested',by,at,note:reason}]};
  const {rows}=await client.query('INSERT INTO cdir_deletion_requests(record_data) VALUES($1::jsonb) RETURNING id',[JSON.stringify(record)]);
  await notify(client,recipients,record.requestNo,`C-Directory deletion approval: ${record.master}, ${record.empId} ${record.name}, ${record.site}. Reason: ${reason}`);
  req.audit={eventType:'Master data',module:'C-Dir',action:'Request record deletion',targetReference:record.requestNo};
  return {status:202,body:{approvalRequired:true,requestNo:record.requestNo,id:rows[0].id}};
 });
 app.post('/api/cdir/deletion-requests',requireSession,create);
 app.patch('/api/cdir/deletion-requests/:id/:action',requireSession,wrap(async(req,ctx,client)=>{
  if(!/^\d+$/.test(req.params.id)||!['approve','reject'].includes(req.params.action))fail(400,'Invalid deletion action.');
  const {rows}=await client.query('SELECT record_data FROM cdir_deletion_requests WHERE id=$1 FOR UPDATE',[req.params.id]);const record=rows[0]?.record_data;if(!record)fail(404,'Deletion request not found.');
  if(record.status!=='Pending')fail(409,'This deletion request is already finalized.');
  if(!employeeTransferSiteAllowed(ctx,record.site))fail(403,'Only the assigned location approver can decide this request.');
  const note=String(req.body?.note||'').trim().slice(0,2000),at=new Date().toISOString(),by=req.session.name||req.session.login;if(req.params.action==='reject'&&!note)fail(400,'Enter a rejection reason.');
  if(req.params.action==='approve'){
   const current=await target(client,record.master,record.recordId);if(current.revision!==record.revision||current.site!==record.site)fail(409,'The record or its location changed. Reject and recreate this request.');
   const pendingTransfer=await client.query(`SELECT id FROM employee_transfers WHERE record_data->>'employeeRecordId'=$1 AND record_data->>'status'=ANY($2::text[])`,[record.employeeRecordId,['Awaiting source approval','Awaiting destination acceptance']]);if(pendingTransfer.rows.length)fail(409,'A transfer is pending for this employee.');
   await client.query('DELETE FROM master_records WHERE master_name=$1 AND id=$2',[record.master,record.recordId]);record.status='Approved';
  }else record.status='Rejected';
  record.decidedBy=by;record.decidedAt=at;record.decisionNote=note;record.history.push({action:record.status,by,at,note});
  await client.query('UPDATE cdir_deletion_requests SET record_data=$1::jsonb WHERE id=$2',[JSON.stringify(record),req.params.id]);
  await notify(client,[record.requestedLogin,...record.recipients],record.requestNo,`${record.requestNo}: deletion ${record.status.toLowerCase()} for ${record.name} at ${record.site}.`);
  req.audit={eventType:'Master data',module:'C-Dir',action:`${record.status} record deletion`,targetReference:record.requestNo};return {body:{ok:true,status:record.status}};
 }));
 return (req,res,next)=>{req.body={master:decodeURIComponent(req.params.master),recordId:req.params.id,reason:req.get('X-Audit-Reason')};return create(req,res,next);};
}
