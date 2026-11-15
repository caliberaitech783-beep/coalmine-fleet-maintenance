// Vehicle transfers completed in Pulse-II (pulse-ll.cmll.in), written into Pulse.
//
// Pulse keeps the Equipment master, and Pulse-II copies it every hour. A transfer accepted only
// in Pulse-II used to move the vehicle there and then jump back at the next copy, because Pulse
// still had the old site. Pulse-II now sends each accepted transfer here first, through the MIS
// bridge ('vehicle-transfer-complete', Pulse Master Sync channel), and moves the vehicle on its
// side only after Pulse answers.
//
// Here, in one transaction:
//  - the same Pulse-II transfer number sent again returns the first answer (a retry after a lost
//    reply never records a second transfer);
//  - the vehicle must be at the source site in Pulse (409 with the site Pulse shows otherwise),
//    or already at the destination (recorded, nothing moved);
//  - the destination must be a Pulse site, and no Pulse transfer of the vehicle may be in progress;
//  - the completed transfer is written to Pulse's own Vehicle transfers register with every
//    Pulse-II stage (who submitted, released, verified, accepted) and the vehicle is moved.
import {canonicalSiteName} from './site-location.mjs';
import {displaySiteName} from './region-scope.mjs';
import {VEHICLE_TRANSFER_STATUS,applyAcceptedVehicleTransfer,transferMatchesEquipment,vehicleTransferStatus} from './vehicle-transfer-workflow.mjs';

export const MIS_TRANSFER_MASTERS=Object.freeze(['Equipment master','LMV master']);
const TRANSFER_FIELDS=['transferNo','transferDate','transferTime','equipment','door','reg','modelNo','manufacturerSerialNo','chassisNo','driver','dieselQty','kmr','hmr','remarks'];
const PEOPLE_FIELDS=['submittedBy','submittedLogin','submittedAt','sourceApprovedBy','sourceApprovedLogin','sourceApprovedAt',
 'destinationMisVerifiedBy','destinationMisVerifiedLogin','destinationMisVerifiedAt','destinationAcceptedBy','destinationAcceptedLogin','destinationAcceptedAt'];
const text=(value,max=200)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
const fail=(status,message,extra={})=>Object.assign(new Error(message),{status,...extra});
const istDate=(now=Date.now())=>new Date(now+5.5*3600_000).toISOString().slice(0,10);

export function normalizeMisTransfer(body={},{now=Date.now()}={}){
 const input=body?.transfer&&typeof body.transfer==='object'?body.transfer:{};
 const transfer={};
 for(const key of TRANSFER_FIELDS){const value=text(input[key],key==='remarks'?500:200);if(value)transfer[key]=value;}
 transfer.source=displaySiteName(text(input.source));
 transfer.destination=displaySiteName(text(input.destination));
 if(!transfer.transferDate)transfer.transferDate=istDate(now);
 const given=body?.people&&typeof body.people==='object'?body.people:{};
 const people={};
 for(const key of PEOPLE_FIELDS){const value=text(given[key]);if(value)people[key]=key.endsWith('Login')?value.toLowerCase():value;}
 if(!/^[A-Za-z0-9][A-Za-z0-9 ._/-]{2,79}$/.test(transfer.transferNo||''))throw fail(422,'A valid Pulse-II transfer number is required.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(transfer.transferDate))throw fail(422,'A valid transfer date is required.');
 const source=canonicalSiteName(transfer.source),destination=canonicalSiteName(transfer.destination);
 if(!source||!destination)throw fail(422,'The source and destination sites are required.');
 if(source===destination)throw fail(422,'The destination site must be different from the source site.');
 if(!people.destinationAcceptedBy&&!people.sourceApprovedBy)throw fail(422,'The Pulse-II person who approved the transfer is required.');
 const equipmentId=/^\d+$/.test(String(body?.equipmentId??''))?String(body.equipmentId):null;
 const master=MIS_TRANSFER_MASTERS.includes(body?.master)?body.master:'Equipment master';
 const route=body?.route==='express'?'express':'workflow';
 return {transfer,people,equipmentId,master,route};
}

const vehicleLabel=(transfer,record={})=>text(record.door||record.doorNo||record.equipmentDoorNo||transfer.door||transfer.equipment||transfer.reg||transfer.chassisNo,80)||'this vehicle';
const siteOf=record=>displaySiteName(record?.currentLocation||record?.location||record?.site||'');

export function createMisVehicleTransfers({pool,siteOptions,afterApply=()=>{},now=Date.now}){
 return {
  /** Completes one Pulse-II transfer in Pulse. `by` is the Pulse login of the bridge channel. */
  async complete(body,{by=''}={}){
   const {transfer,people,equipmentId,master,route}=normalizeMisTransfer(body,{now:now()});
   const client=await pool.connect();
   try{
    await client.query('BEGIN');
    // One Pulse-II transfer at a time: the number check and the site check cannot race.
    await client.query('SELECT pg_advisory_xact_lock(783,44)');
    const prior=(await client.query(`SELECT id,record_data FROM master_records WHERE master_name='Vehicle transfers' AND lower(record_data->>'transferNo')=lower($1) ORDER BY id LIMIT 1`,[transfer.transferNo])).rows[0];
    if(prior){
     const saved=prior.record_data||{};
     if(saved.origin==='Pulse-II'&&canonicalSiteName(saved.destination)===canonicalSiteName(transfer.destination)){
      await client.query('ROLLBACK');
      return {pulseTransferId:String(prior.id),equipmentId:String(saved.equipmentMasterId||''),master:saved.equipmentMaster||'Equipment master',site:displaySiteName(saved.destination),
       previousSite:displaySiteName(saved.source),updatedAt:saved.receivedAt||'',replay:true,alreadyAtDestination:saved.alreadyAtDestination===true,record:saved};
     }
     throw fail(409,`Transfer number ${transfer.transferNo} is already used in Pulse for a different transfer. Nothing was changed.`);
    }
    const {rows:fleet}=await client.query('SELECT id,record_data FROM master_records WHERE master_name=$1 ORDER BY id',[master]);
    let row=equipmentId?fleet.find(entry=>String(entry.id)===equipmentId):null;
    if(!row){
     const matches=fleet.filter(entry=>transferMatchesEquipment({...transfer,equipmentMasterId:''},{id:entry.id,...entry.record_data}));
     if(matches.length>1)throw fail(409,`More than one Pulse ${master} record matches ${vehicleLabel(transfer)}. Correct the duplicate in Pulse first. Nothing was changed.`);
     row=matches[0];
    }
    if(!row)throw fail(404,`Pulse has no ${master} record for ${vehicleLabel(transfer)}. Nothing was changed.`);
    const locked=(await client.query('SELECT id,record_data FROM master_records WHERE id=$1 AND master_name=$2 FOR UPDATE',[row.id,master])).rows[0];
    if(!locked)throw fail(409,'The vehicle changed in Pulse while this transfer was checked. Try again.');
    const record=locked.record_data||{},label=vehicleLabel(transfer,record),current=siteOf(record);
    const alreadyAtDestination=canonicalSiteName(current)===canonicalSiteName(transfer.destination);
    if(!alreadyAtDestination&&canonicalSiteName(current)!==canonicalSiteName(transfer.source))
     throw fail(409,`Pulse shows ${label} at ${current||'no site'}, not ${transfer.source}. Nothing was changed.`,{site:current});
    const sites=await siteOptions(client);
    if(!sites.some(site=>canonicalSiteName(site)===canonicalSiteName(transfer.destination)))
     throw fail(404,`${transfer.destination} is not a site in Pulse. Nothing was changed.`);
    const open=(await client.query(`SELECT record_data FROM master_records WHERE master_name='Vehicle transfers' AND record_data->>'equipmentMasterId'=$1`,[String(row.id)])).rows
     .map(entry=>entry.record_data||{}).find(entry=>vehicleTransferStatus(entry)!==VEHICLE_TRANSFER_STATUS.COMPLETED);
    if(open)throw fail(409,`Pulse transfer ${open.transferNo||''} of ${label} is still in progress (${open.status}). Finish it in Pulse first. Nothing was changed.`);
    const at=new Date(now()).toISOString();
    const acceptedBy=people.destinationAcceptedBy||people.sourceApprovedBy;
    const saved={...transfer,...people,source:transfer.source,destination:transfer.destination,equipmentMasterId:row.id,equipmentMaster:master,
     status:VEHICLE_TRANSFER_STATUS.COMPLETED,origin:'Pulse-II',originRoute:route,originChannel:text(by,120),receivedAt:at,alreadyAtDestination,
     previousSite:current,vehicleMasterRecordId:row.id,...(alreadyAtDestination?{}:{vehicleMasterUpdatedAt:at})};
    const inserted=(await client.query(`INSERT INTO master_records(master_name,record_data) VALUES('Vehicle transfers',$1::jsonb) RETURNING id`,[JSON.stringify(saved)])).rows[0].id;
    if(!alreadyAtDestination)await client.query('UPDATE master_records SET record_data=$1::jsonb WHERE id=$2 AND master_name=$3',
     [JSON.stringify(applyAcceptedVehicleTransfer(record,saved,{acceptedAt:people.destinationAcceptedAt||at,acceptedBy})),row.id,master]);
    await client.query('COMMIT');
    try{afterApply();}catch{}
    return {pulseTransferId:String(inserted),equipmentId:String(row.id),master,site:transfer.destination,previousSite:current,updatedAt:at,replay:false,alreadyAtDestination,record:saved};
   }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
   finally{client.release();}
  },
 };
}
