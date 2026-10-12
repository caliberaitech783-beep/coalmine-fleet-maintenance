import {equipmentGroupValue,normalizeEquipmentGroup} from '../equipment-group.mjs';
export const UNCLASSIFIED_REPORT_GROUP='__unclassified__';
export function reportEquipmentGroupOptions(rows=[]){
 const groups=[...new Set(rows.map(row=>equipmentGroupValue(row)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
 const options=groups.map(value=>({value,label:value}));
 if(rows.some(row=>!equipmentGroupValue(row)))options.push({value:UNCLASSIFIED_REPORT_GROUP,label:'Unclassified'});
 return options;
}
export function matchesReportEquipmentGroup(row,selected=''){
 if(!selected)return true;
 const group=equipmentGroupValue(row);
 return selected===UNCLASSIFIED_REPORT_GROUP?!group:group===normalizeEquipmentGroup(selected);
}