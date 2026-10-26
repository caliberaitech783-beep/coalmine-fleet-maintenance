const token=value=>String(value||'').replace(/[^a-z0-9]/gi,'').toLowerCase();
export const addonRepairTypeKey=value=>['scheduleservice','scheduledservice'].includes(token(value))?'scheduledservice':token(value);
export const supportsMaintenanceAddon=value=>['wgm','scheduledservice'].includes(addonRepairTypeKey(value));

// The caller owns the closure transaction: an invalid add-on rolls it all back.
export async function createMaintenanceAddon(client,req,original,draft,dependencies){
  const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
  if(req.session?.assignedRole!=='Maintenance User')fail('Only Maintenance Users can create an add-on while closing a request.',403);
  if(!supportsMaintenanceAddon(original.category))fail('Add-on requests are available only when closing WGM or Schedule Service.');
  if(req.body?.ideal || req.body?.status!=='Closed')fail('Close the original request without marking the vehicle Idle when creating an add-on.');
  if(!draft || typeof draft!=='object' || Array.isArray(draft))fail('Enter the add-on request details.');
  const ref=String(draft.ref||'').trim(),category=String(draft.category||'').trim(),complaint=String(draft.complaint||'').trim();
  if(!/^REQ-[a-zA-Z0-9-]{1,100}$/.test(ref)||!category||!complaint)fail('Repair type, complaint and a valid add-on reference are required.');
  if(addonRepairTypeKey(category)===addonRepairTypeKey(original.category))fail('Choose a different repair type for the add-on request.');
  const masters=await client.query("SELECT record_data FROM master_records WHERE master_name='Repair type master'");
  const repairType=masters.rows.map(row=>String(row.record_data.repairType||'').trim()).find(value=>value.toLowerCase()===category.toLowerCase());
  if(!repairType)fail('Select a repair type from the master for the add-on request.');
  const subCategory=await dependencies.requestSubCategory(client,repairType,draft.subCategory,true);
  const keys=[['door',original.door],['chassis',original.chassis]].filter(([,value])=>String(value||'').trim())
    .map(([field,value])=>`bdms-request:${field}:${String(value).trim().toLowerCase()}`).sort();
  if(!keys.length)fail('The original request has no vehicle identity.',409);
  for(const key of keys)await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
  const conflict=await dependencies.activeRequestConflict(original,client);
  if(conflict)fail('Another request is still open for this vehicle. Close its linked requests before creating an add-on.',409);
  const prior=await client.query('SELECT reference FROM maintenance_requests WHERE reference=$1',[ref]);
  if(prior.rows.length)fail('This add-on reference is already in use. Refresh the request list before retrying.',409);
  const startedAt=dependencies.parseRequestTimelineTimestamp(original.closedAt);
  if(!startedAt)fail('The original closing time is invalid.');
  const shifts=await client.query("SELECT record_data FROM master_records WHERE master_name='Shift Master'");
  const shift=dependencies.requestShiftLabel({start:startedAt,site:original.site},shifts.rows.map(row=>row.record_data));
  const result=await client.query(`INSERT INTO maintenance_requests
    (reference,equipment_name,equipment_group,door_number,registration_number,chassis_number,driver_name,driver_name_source,superior_name,site,category,sub_category,complaint,started_at,acceptance_required,status,owner_name,requester_login,requester_role,meter_type,request_shift,linked_request_references)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,TRUE,'Open',$15,$16,'Maintenance User',$17,$18,$19::jsonb)
    RETURNING ${dependencies.requestProjection}`,
    [ref,original.equipment||'',original.equipmentGroup||'',original.door||'',original.reg||'',original.chassis||'',original.driverName||'',original.driverNameSource||'',original.superior||'',original.site,repairType,subCategory,complaint,startedAt,req.session.name||'Maintenance User',String(req.session.login||'').trim().toLowerCase(),original.meterType||'HMR',shift,JSON.stringify([original.ref])]);
  await client.query(`UPDATE maintenance_requests SET linked_request_references=(SELECT jsonb_agg(DISTINCT item) FROM jsonb_array_elements_text(linked_request_references || $2::jsonb) item) WHERE reference=$1`,[original.ref,JSON.stringify([ref])]);
  await dependencies.recordRequestTimeline(client,req,ref,{}, {events:['start'],sources:{start:'system'}});
  return result.rows[0];
}
