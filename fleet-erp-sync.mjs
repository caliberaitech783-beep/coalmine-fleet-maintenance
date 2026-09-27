import {withFleetDriverNames} from './fleet-driver-names.mjs';

const value = input => {
  const text=String(input??'').trim();
  return ['', '-', '—'].includes(text)?'':text;
};

// Update only existing, positively identified ERP assets; never infer a model
// from its make, equipment group, or another vehicle.
export function fleetErpUpdates(records,erpEquipment,drivers){
  const byId=new Map(erpEquipment.filter(row=>value(row.oracleEquipmentTno)).map(row=>[String(row.oracleEquipmentTno),row]));
  const enriched=withFleetDriverNames(records.map(row=>row.record_data),drivers);
  let driversFound=0,modelsFound=0,matched=0;
  const updates=records.map((row,index)=>{
    const current=row.record_data,erp=byId.get(String(current.oracleEquipmentTno||''));
    const record={...enriched[index]};
    if(erp){
      matched++;
      if(value(erp.model))record.model=value(erp.model);
      if(value(erp.make))record.make=value(erp.make);
    }
    if(value(record.logbookDriverName))driversFound++;
    if(value(record.model))modelsFound++;
    return {id:row.id,record};
  }).filter((row,index)=>JSON.stringify(row.record)!==JSON.stringify(records[index].record_data));
  return {updates,summary:{total:records.length,matched,updated:updates.length,driversFound,modelsFound,missingDrivers:records.length-driversFound,missingModels:records.length-modelsFound}};
}
