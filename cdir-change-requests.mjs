import {randomUUID} from 'node:crypto';
import {CDIR_MASTERS,CDIR_MASTER_FIELDS,cdirNormalizeRecord,cdirEmployeeError} from './cdir-masters.mjs';
import {canEditCdirEmployee} from './cdir-employee-edit.mjs';
import {employeeTransferAccess,employeeTransferSiteAllowed} from './employee-transfer.mjs';
import {approvalRoleForSite} from './cdir-approval-routing.mjs';
import {cdirLogin,cdirSameRecord,cdirSiteKey,cdirSubmissionAllowed} from './cdir-change-policy.mjs';

export const CDIR_CHANGE_SCHEMA=`CREATE TABLE IF NOT EXISTS cdir_change_requests(id BIGSERIAL PRIMARY KEY,record_data JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); CREATE UNIQUE INDEX IF NOT EXISTS cdir_change_reference_idx ON cdir_change_requests((record_data->>'requestNo')); CREATE INDEX IF NOT EXISTS cdir_change_status_idx ON cdir_change_requests((record_data->>'status'));`;
export const governedCdirMaster=master=>[CDIR_MASTERS.employee,CDIR_MASTERS.contact].includes(master);
const clean=value=>String(value??'').trim();
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
function validate(master,value){
  const keys=new Set((CDIR_MASTER_FIELDS[master]||[]).map(([key])=>key));
  if(!governedCdirMaster(master)||!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.has(key)))fail(400,'Invalid directory fields.');
  for(const entry of Object.values(value))if(typeof entry!=='string'||entry.length>500)fail(400,'Directory fields must be text of at most 500 characters.');
  for(const key of ['dob','doj'])if(value[key]&&(!/^\d{4}-\d{2}-\d{2}$/.test(value[key])||!Number.isFinite(Date.parse(value[key]))||new Date(value[key]).toISOString().slice(0,10)!==value[key]))fail(400,'Enter valid employee dates.');
  return cdirNormalizeRecord(master,Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,entry.trim()])));
}
const vacant=record=>record.status==='VACANT'&&!clean(record.name)&&!clean(record.empId);
const identity=record=>clean(record.empId)?`id:${cdirLogin(record.empId)}`:vacant(record)?`vacancy:${cdirSiteKey(record.site)}:${cdirLogin(record.category)}:${cdirLogin(record.designation)}:${cdirLogin(record.department)}`:`name:${cdirLogin(record.name)}:${cdirSiteKey(record.site)}`;
export function cdirChangeVisible(record,session,user){
  const context=employeeTransferAccess(session,user);
  return context.canSubmit&&(cdirLogin(record.requestedLogin)===cdirLogin(session.login)||record.sites.some(site=>cdirSubmissionAllowed(session,user,site)||employeeTransferSiteAllowed(context,site)));
}

export function registerCdirChanges(app,{pool,requireSession,loadViewer,loadMasters,approverLogins,notify}){
  // Called inside the same advisory-locked transaction by both profile and master routes.
  const stage=async(client,req,items,reason)=>{
    const user=await loadViewer(req.session);
    if(!canEditCdirEmployee(req.session,user))fail(403,'Only HR, directors and administrators may submit employee updates.');
    reason=clean(reason);if(!reason||reason.length>2000)fail(400,'Enter a change reason of at most 2,000 characters.');
    if(!Array.isArray(items)||!items.length||items.length>250)fail(400,'Submit between 1 and 250 directory records at a time.');
    const {rows:roster}=await client.query('SELECT id,master_name,record_data FROM master_records WHERE master_name=ANY($1::text[]) ORDER BY id FOR UPDATE',[[CDIR_MASTERS.employee,CDIR_MASTERS.contact]]);
    const validationMasters=await loadMasters([CDIR_MASTERS.site,CDIR_MASTERS.category],client);
    const changes=[],snapshots=new Map(),sites=new Map(),keys=new Set();
    const addEmployee=row=>{if(!row.record_data.site)fail(409,'Assign a valid employee location before submitting a change.');snapshots.set(String(row.id),row.record_data);sites.set(cdirSiteKey(row.record_data.site),row.record_data.site);keys.add(identity(row.record_data));};
    for(const item of items){
      if(!governedCdirMaster(item.master))fail(400,'Select an employee or contact master.');
      const stored=item.recordId?roster.find(row=>String(row.id)===String(item.recordId)&&row.master_name===item.master):null;
      if(item.recordId&&!stored)fail(404,'Directory record no longer exists.');
      if(item.before!==undefined&&!cdirSameRecord(stored?.record_data||null,item.before))fail(409,'This record changed. Reopen it before submitting.');
      const before=stored?.record_data||null,after=validate(item.master,item.after);
      if(before&&cdirSameRecord(before,after))continue;
      if(before&&cdirLogin(before.empId)!==cdirLogin(after.empId)&&!(item.master===CDIR_MASTERS.contact&&!clean(before.empId)&&clean(after.empId)))fail(409,'Employee identity cannot be changed through an ordinary edit.');
      if(item.master===CDIR_MASTERS.employee){
        if(before&&cdirSiteKey(before.site)!==cdirSiteKey(after.site))fail(409,'Use Employee Transfer for a location change. Source and destination approval are required.');
        if(before&&!clean(before.empId)&&cdirLogin(before.name)!==cdirLogin(after.name)){
          const linked=roster.filter(row=>row.master_name===CDIR_MASTERS.contact&&!clean(row.record_data.empId)&&cdirLogin(row.record_data.name)===cdirLogin(before.name));
          if(linked.some(row=>!items.some(item=>item.master===CDIR_MASTERS.contact&&String(item.recordId)===String(row.id)&&cdirLogin(item.after?.name)===cdirLogin(after.name))))fail(409,'Use the employee profile editor to rename this employee and their linked contact together.');
        }
        const error=cdirEmployeeError(after,validationMasters);if(error)fail(400,error);
        if(stored)addEmployee(stored);else{
          if(!vacant(after)&&roster.some(row=>row.master_name===item.master&&identity(row.record_data)===identity(after)))fail(409,'This employee already exists. Edit the existing record instead of importing a duplicate.');
          if(!vacant(after)&&keys.has(identity(after)))fail(409,'The submitted batch repeats an employee identity.');
          keys.add(identity(after));sites.set(cdirSiteKey(after.site),after.site);
        }
      }else{
        const target=before||after;
        const matches=roster.filter(row=>row.master_name===CDIR_MASTERS.employee&&(clean(target.empId)?cdirLogin(row.record_data.empId)===cdirLogin(target.empId):cdirLogin(row.record_data.name)===cdirLogin(target.name)));
        if(!matches.length)fail(409,'Contact changes must match an approved employee record. Approve the employee first.');
        if(!clean(target.empId)&&matches.length>1)fail(409,'The contact name is ambiguous. Reconcile employee identities first.');
        if(clean(after.empId)&&matches.some(row=>cdirLogin(row.record_data.empId)!==cdirLogin(after.empId)))fail(409,'Contact identity does not match the affected employee.');
        matches.forEach(addEmployee);
        if(!stored&&roster.some(row=>row.master_name===item.master&&(clean(after.empId)?cdirLogin(row.record_data.empId)===cdirLogin(after.empId):cdirLogin(row.record_data.name)===cdirLogin(after.name))))fail(409,'This contact already exists. Edit the existing contact.');
      }
      if(changes.some(change=>item.recordId&&change.recordId===String(item.recordId)))fail(400,'A record occurs twice in this request.');
      if(!stored&&!(item.master===CDIR_MASTERS.employee&&vacant(after))&&changes.some(change=>!change.recordId&&change.master===item.master&&identity(change.after)===identity(after)))fail(409,'The submitted batch repeats a record identity.');
      changes.push({master:item.master,recordId:item.recordId?String(item.recordId):null,before,after});
    }
    if(!changes.length)fail(400,'No changes were entered.');
    const locations=[...sites.values()],employeeRecordIds=[...snapshots.keys()];
    if(locations.some(site=>!cdirSubmissionAllowed(req.session,user,site)))fail(403,'You may submit changes only for your assigned locations. Nagpur HR may submit across sites.');
    const {rows:pending}=await client.query("SELECT record_data FROM cdir_change_requests WHERE record_data->>'status'='Pending'");
    if(pending.some(row=>(row.record_data.identityKeys||[]).some(key=>keys.has(key))||(row.record_data.employeeRecordIds||[]).some(id=>snapshots.has(String(id)))))fail(409,'An update is already pending for this employee. Complete or reject it first.');
    if(employeeRecordIds.length){
      const transfers=await client.query("SELECT id FROM employee_transfers WHERE record_data->>'employeeRecordId'=ANY($1::text[]) AND record_data->>'status'=ANY($2::text[])",[employeeRecordIds,['Awaiting source approval','Awaiting destination acceptance']]);
      const deletions=await client.query("SELECT id FROM cdir_deletion_requests WHERE record_data->>'employeeRecordId'=ANY($1::text[]) AND record_data->>'status'='Pending'",[employeeRecordIds]);
      if(transfers.rows.length||deletions.rows.length)fail(409,'Complete or reject the pending transfer/deletion before requesting an update.');
    }
    const login=cdirLogin(req.session.login),approvals=[];
    for(const site of locations){const recipients=(await approverLogins(client,site)).map(cdirLogin).filter(value=>value&&value!==login);if(!recipients.length)fail(409,`Assign another ${approvalRoleForSite(site)} to ${site} before submitting. Requesters cannot approve their own changes.`);approvals.push({site,role:approvalRoleForSite(site),recipients,status:'Pending'});}
    const at=new Date().toISOString(),by=req.session.name||req.session.login;
    const record={requestNo:`CD-UPD-${Date.now()}-${randomUUID().slice(0,8).toUpperCase()}`,status:'Pending',sites:locations,site:locations.join(' | '),approvals,changes,employeeSnapshots:[...snapshots].map(([id,record])=>({id,record})),employeeRecordIds,identityKeys:[...keys],reason,requestedLogin:login,requestedBy:by,requestedAt:at,history:[{action:'Submitted',by,login,at,note:reason}]};
    const {rows}=await client.query('INSERT INTO cdir_change_requests(record_data) VALUES($1::jsonb) RETURNING id',[JSON.stringify(record)]);
    await notify(client,[...new Set(approvals.flatMap(item=>item.recipients))],record.requestNo,`Directory update approval: ${record.site}. ${changes.length} record(s). Reason: ${reason}`);
    req.audit={eventType:'Master data',module:'C-Dir',action:'Request directory update',targetReference:record.requestNo};
    return {approvalRequired:true,id:rows[0].id,requestNo:record.requestNo,status:'Pending'};
  };
  const masterHandler=(create)=>async(req,res,next)=>{let client;try{
    client=await pool.connect();await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtext('cdir-employee-edit'))");
    const master=decodeURIComponent(req.params.master);
    if(!create&&(!req.body?.before||!req.body?.record))fail(409,'Reload this master before submitting. An original record snapshot is required.');
    const records=create?(Array.isArray(req.body)?req.body:[req.body]):[req.body.record];
    const items=records.map(record=>({master,recordId:create?null:req.params.id,...(!create?{before:Object.fromEntries(Object.entries(req.body.before).filter(([key])=>key!=='id'))}:{}),after:Object.fromEntries(Object.entries(record||{}).filter(([key])=>key!=='id'))}));
    const result=await stage(client,req,items,req.get('X-Audit-Reason'));await client.query('COMMIT');res.status(202).json(result);
  }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});next(error);}finally{client?.release();}};
  app.get('/api/cdir/change-requests',requireSession,async(req,res,next)=>{try{
    const user=await loadViewer(req.session),context=employeeTransferAccess(req.session,user);if(!context.canSubmit)fail(403,'Directory approvals are not available to this role.');
    const {rows}=await pool.query('SELECT id,record_data FROM cdir_change_requests ORDER BY created_at DESC,id DESC');
    res.set('Cache-Control','no-store');res.json({records:rows.map(row=>({id:row.id,...row.record_data})).filter(row=>cdirChangeVisible(row,req.session,user)).map(row=>({...row,reviewSites:row.status==='Pending'&&cdirLogin(row.requestedLogin)!==cdirLogin(req.session.login)?row.approvals.filter(item=>item.status==='Pending'&&employeeTransferSiteAllowed(context,item.site)).map(item=>item.site):[]}))});
  }catch(error){next(error);}});
  app.patch('/api/cdir/change-requests/:id/:action',requireSession,async(req,res,next)=>{let client;try{
    if(!/^\d+$/.test(req.params.id)||!['approve','reject'].includes(req.params.action))fail(400,'Invalid update decision.');
    const user=await loadViewer(req.session),context=employeeTransferAccess(req.session,user),login=cdirLogin(req.session.login);
    client=await pool.connect();await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtext('cdir-employee-edit'))");
    const {rows}=await client.query('SELECT record_data FROM cdir_change_requests WHERE id=$1 FOR UPDATE',[req.params.id]);const record=rows[0]?.record_data;
    if(!record)fail(404,'Update request not found.');if(record.status!=='Pending')fail(409,'This update request is already finalized.');
    if(cdirLogin(record.requestedLogin)===login)fail(403,'You cannot approve or reject your own request.');
    const approval=record.approvals.find(item=>cdirSiteKey(item.site)===cdirSiteKey(req.body?.site)&&item.status==='Pending');
    if(!approval||!employeeTransferSiteAllowed(context,approval.site)||!(await approverLogins(client,approval.site)).map(cdirLogin).includes(login))fail(403,'Only the currently assigned location approver can decide this request.');
    const note=clean(req.body?.note);if(note.length>2000||req.params.action==='reject'&&!note)fail(400,'Enter a rejection reason of at most 2,000 characters.');
    const at=new Date().toISOString(),by=req.session.name||req.session.login;
    approval.status=req.params.action==='approve'?'Approved':'Rejected';approval.by=by;approval.login=login;approval.at=at;approval.note=note;
    record.history.push({action:approval.status,site:approval.site,by,login,at,note});
    if(req.params.action==='reject')record.status='Rejected';
    else if(record.approvals.every(item=>item.status==='Approved')){
      for(const item of record.approvals)if(!(await approverLogins(client,item.site)).map(cdirLogin).includes(item.login))fail(409,'An approver assignment changed. Reject and recreate this request.');
      for(const snapshot of record.employeeSnapshots){const current=await client.query('SELECT record_data FROM master_records WHERE id=$1 AND master_name=$2 FOR UPDATE',[snapshot.id,CDIR_MASTERS.employee]);if(!cdirSameRecord(current.rows[0]?.record_data,snapshot.record))fail(409,'Employee details or location changed. Reject and recreate this request.');}
      for(const change of record.changes){
        if(change.recordId){const current=await client.query('SELECT record_data FROM master_records WHERE id=$1 AND master_name=$2 FOR UPDATE',[change.recordId,change.master]);if(!cdirSameRecord(current.rows[0]?.record_data,change.before))fail(409,'A record changed. Reject and recreate this request.');}
        else{const existing=await client.query('SELECT record_data FROM master_records WHERE master_name=$1',[change.master]);if(existing.rows.some(row=>change.master===CDIR_MASTERS.employee?!vacant(change.after)&&identity(row.record_data)===identity(change.after):clean(change.after.empId)?cdirLogin(row.record_data.empId)===cdirLogin(change.after.empId):cdirLogin(row.record_data.name)===cdirLogin(change.after.name)))fail(409,'This employee/contact was created after submission. Reject the duplicate request.');}
        if(change.master===CDIR_MASTERS.employee){const error=cdirEmployeeError(change.after,await loadMasters([CDIR_MASTERS.site,CDIR_MASTERS.category],client));if(error)fail(409,error);}
      }
      for(const change of record.changes){
        if(change.recordId)await client.query('UPDATE master_records SET record_data=$1::jsonb WHERE id=$2 AND master_name=$3',[JSON.stringify(change.after),change.recordId,change.master]);
        else{const saved=await client.query('INSERT INTO master_records(master_name,record_data) VALUES($1,$2::jsonb) RETURNING id',[change.master,JSON.stringify(change.after)]);change.appliedRecordId=String(saved.rows[0].id);}
      }
      record.status='Approved';record.appliedAt=at;
    }
    await client.query('UPDATE cdir_change_requests SET record_data=$1::jsonb WHERE id=$2',[JSON.stringify(record),req.params.id]);
    await notify(client,[...new Set([record.requestedLogin,...record.approvals.flatMap(item=>item.recipients)])],record.requestNo,`${record.requestNo}: ${approval.site} ${approval.status.toLowerCase()}. Overall status: ${record.status}.`);
    await client.query('COMMIT');req.audit={eventType:'Master data',module:'C-Dir',action:`${approval.status} directory update`,targetReference:record.requestNo};res.json({ok:true,status:record.status});
  }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});next(error);}finally{client?.release();}});
  return {stage,create:masterHandler(true),update:masterHandler(false)};
}
