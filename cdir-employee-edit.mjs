import {assignedUserRoles} from './account-role-access.mjs';
import {createHash} from 'node:crypto';
import {CDIR_MASTERS,CDIR_MASTER_FIELDS,cdirNormalizeRecord,cdirEmployeeError} from './cdir-masters.mjs';

export function canEditCdirEmployee(session={},user={}) {
  return session?.assignedRole==='HR User'||assignedUserRoles(user).includes('HR User')
    || /\bdirector\b/i.test(String(user.designation||user.employeeDesignation||''))
    || (session?.role==='super'&&['admin','super admin'].includes(String(session.permissions?.adminLevel||'').trim().toLowerCase()));
}
const contactKeys=['contact','whatsapp','emergencyContact','email'];
const employeeFields=CDIR_MASTER_FIELDS[CDIR_MASTERS.employee].filter(([key])=>!['rank','order','empId'].includes(key));
export const CDIR_EDIT_FIELDS=[...employeeFields,...CDIR_MASTER_FIELDS[CDIR_MASTERS.contact].filter(([key])=>contactKeys.includes(key))];
const keys=new Set(CDIR_EDIT_FIELDS.map(([key])=>key));
const revision=(employee,contact)=>createHash('sha256').update(JSON.stringify([employee,contact])).digest('hex');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};

async function loadRecord(client,id,lock=false){
  const {rows}=await client.query(`SELECT id,record_data FROM master_records WHERE master_name=$1 AND id=$2${lock?' FOR UPDATE':''}`,[CDIR_MASTERS.employee,id]);
  if(!rows.length)fail(404,'Employee not found. Refresh the directory.');
  const employee=rows[0].record_data;
  const identity=String(employee.empId||'').trim()?'empId':'name';
  const value=String(employee[identity]||'').trim();
  let contacts=value?(await client.query(`SELECT id,record_data FROM master_records WHERE master_name=$1 AND lower(trim(record_data->>$2))=lower($3) ORDER BY id${lock?' FOR UPDATE':''}`,[CDIR_MASTERS.contact,identity,value])).rows:[];
  if(!contacts.length&&identity==='empId'&&String(employee.name||'').trim())contacts=(await client.query(`SELECT id,record_data FROM master_records WHERE master_name=$1 AND lower(trim(record_data->>'name'))=lower($2) ORDER BY id${lock?' FOR UPDATE':''}`,[CDIR_MASTERS.contact,String(employee.name).trim()])).rows;
  if(contacts.length>1)fail(409,'Multiple matching contact records exist. An administrator must reconcile them in Masters before editing.');
  if(identity==='empId'&&contacts[0]?.record_data?.empId&&String(contacts[0].record_data.empId).trim().toLowerCase()!==value.toLowerCase())fail(409,'The matching name belongs to a contact with a different employee ID. Reconcile the contact in Masters before editing.');
  return {employee,contact:contacts[0]||null};
}

export function registerCdirEmployeeEdit(app,{pool,requireSession,loadMasters,auditChangedFields,loadViewer=async()=>({})}){
  const guard=async(req,res,next)=>{try{const user=await loadViewer(req.session);return canEditCdirEmployee(req.session,user)?next():res.status(403).json({error:'Only HR users, directors and administrators can edit employee details.'});}catch(error){next(error);}};
  app.get('/api/cdir/employees/:id/edit',requireSession,guard,async(req,res,next)=>{
    try{
      res.set('Cache-Control','no-store');
      if(!/^\d+$/.test(req.params.id))fail(400,'Invalid employee ID.');
      const {employee,contact}=await loadRecord(pool,req.params.id);
      const masters=await loadMasters(Object.values(CDIR_MASTERS).filter(name=>![CDIR_MASTERS.employee,CDIR_MASTERS.contact].includes(name)));
      const fields=CDIR_EDIT_FIELDS.map(([key,label,type='text'])=>({key,label,type,
        options:type.startsWith('ref:')?(masters[type.split(':')[1]]||[]).map(row=>row[type.split(':')[2]]).filter(Boolean):type.startsWith('options:')?type.slice(8).split('|'):undefined}));
      res.json({empId:employee.empId||'',revision:revision(employee,contact),fields,record:Object.fromEntries([...keys].map(key=>[key,contactKeys.includes(key)?contact?.record_data?.[key]||'':employee[key]||'']))});
    }catch(error){next(error);}
  });
  app.patch('/api/cdir/employees/:id',requireSession,guard,async(req,res,next)=>{
    let client;
    try{
      if(!/^\d+$/.test(req.params.id)||!req.body?.record||typeof req.body.record!=='object'||Array.isArray(req.body.record))fail(400,'Invalid employee update.');
      if(Object.keys(req.body.record).some(key=>!keys.has(key)))fail(400,'This field cannot be changed from C-Dir.');
      for(const value of Object.values(req.body.record))if(typeof value!=='string'||value.length>500)fail(400,'Use text values of at most 500 characters.');
      for(const key of ['dob','doj']){
        const value=req.body.record[key];
        if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value))fail(400,'Enter a valid date of birth/joining.');
      }
      client=await pool.connect();await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('cdir-employee-edit'))");
      const {employee,contact}=await loadRecord(client,req.params.id,true);
      if(req.body.revision!==revision(employee,contact))fail(409,'This employee was changed by another user. Close and reopen Edit before saving.');
      const updated=cdirNormalizeRecord(CDIR_MASTERS.employee,{...employee,...Object.fromEntries(Object.entries(req.body.record).filter(([key])=>!contactKeys.includes(key)))});
      const masters=await loadMasters([CDIR_MASTERS.site,CDIR_MASTERS.category],client);
      const error=cdirEmployeeError(updated,masters);if(error)fail(400,error);
      // A name-only contact can be shared by several placements. Do not silently
      // disconnect those other employees when renaming one placement.
      if(!String(employee.empId||'').trim()&&updated.name!==employee.name){
        const others=await client.query(`SELECT id FROM master_records WHERE master_name=$1 AND id<>$2 AND lower(trim(record_data->>'name'))=lower($3)`,[CDIR_MASTERS.employee,req.params.id,String(employee.name||'').trim()]);
        if(others.rows.length)fail(409,'This name is shared by multiple employee records without an employee ID. Reconcile their IDs in Masters before renaming.');
      }
      const savedContact=cdirNormalizeRecord(CDIR_MASTERS.contact,{...(contact?.record_data||{}),name:updated.name,empId:updated.empId||'',...Object.fromEntries(contactKeys.map(key=>[key,String(req.body.record[key]??contact?.record_data?.[key]??'').trim()]))});
      await client.query('UPDATE master_records SET record_data=$1::jsonb WHERE id=$2 AND master_name=$3',[JSON.stringify(updated),req.params.id,CDIR_MASTERS.employee]);
      if(contact)await client.query('UPDATE master_records SET record_data=$1::jsonb WHERE id=$2 AND master_name=$3',[JSON.stringify(savedContact),contact.id,CDIR_MASTERS.contact]);
      else if(contactKeys.some(key=>savedContact[key]))await client.query('INSERT INTO master_records(master_name,record_data) VALUES($1,$2::jsonb)',[CDIR_MASTERS.contact,JSON.stringify(savedContact)]);
      await client.query('COMMIT');
      req.audit={eventType:'Master data',module:'C-Dir',action:'Edit employee',targetType:CDIR_MASTERS.employee,targetReference:String(req.params.id),changedFields:auditChangedFields({...employee,...Object.fromEntries(contactKeys.map(key=>[key,contact?.record_data?.[key]||'']))},{...updated,...Object.fromEntries(contactKeys.map(key=>[key,savedContact[key]]))})};
      res.json({ok:true});
    }catch(error){if(client)await client.query('ROLLBACK');next(error);}finally{client?.release();}
  });
}
