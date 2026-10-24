import {liveEquipmentRoadStatuses,fleetAssetRequestDetails} from '../dashboard-equipment-metrics.mjs';
import {recordBelongsToSite} from '../site-location.mjs';
import {lmvCounts,LMV_DETAIL_COLUMNS} from '../lmv-fleet.mjs';
import {equipmentGroupValue} from '../equipment-group.mjs';

const normalized=value=>String(value||'').trim().toLowerCase();
export function totalFleetRecords(equipment=[],lmvs=[],requests=[],oemRecords=[]) {
  const statuses=liveEquipmentRoadStatuses(equipment,requests);
  const oemSet=new Set(oemRecords);
  return [
    ...equipment.map((record,index)=>({...record,fleetKey:`equipment:${record.id??index}`,fleetSource:'Equipment master',fleetRoadStatus:statuses[index],fleetOem:statuses[index]==='offroad'&&oemSet.has(record),fleetCategory:['vehicle','vehicles'].includes(normalized(record.category))?'vehicles':['equipment','equipments'].includes(normalized(record.category))?'equipment':'unclassified'})),
    ...lmvs.map((record,index)=>({...record,fleetKey:`lmv:${record.id??index}`,fleetSource:'LMV master',fleetRoadStatus:record.lmvRoadStatus,fleetOem:record.lmvRoadStatus==='offroad'&&record.lmvOemBreakdown===true,fleetCategory:'otherVehicles'})),
  ];
}
export function totalFleetSelectionRows(records=[],{mode='total',site='',sites=null,category='',make='',group=''}={}) {
  const matchesMode=record=>mode==='total'?true:mode==='oem'?record.fleetOem:mode==='balance'?record.fleetRoadStatus==='offroad'&&!record.fleetOem:mode==='breakdown'?record.fleetRoadStatus==='offroad':record.fleetRoadStatus===mode;
  return records.filter(record=>(!site||recordBelongsToSite(record,site))
    &&(!sites||sites.some(name=>recordBelongsToSite(record,name)))
    &&(!category||record.fleetCategory===category)
    &&(!make||make==='all'||normalized(record.make||record.oem||'OEM not specified')===normalized(make))
    &&(!group||normalized(equipmentGroupValue(record)||record.itemName)===normalized(group))
    &&matchesMode(record));
}
export function totalFleetCounts(records=[]) {
  const breakdown=totalFleetSelectionRows(records,{mode:'breakdown'});
  const categoryCount=(rows,category)=>rows.filter(record=>record.fleetCategory===category).length;
  const oem=breakdown.filter(record=>record.fleetOem).length;
  const lmvs=records.filter(record=>record.fleetCategory==='otherVehicles');
  return {includesLmv:true,total:records.length,equipment:categoryCount(records,'equipment'),vehicles:categoryCount(records,'vehicles'),otherVehicles:lmvs.length,
    breakdown:{total:breakdown.length,equipment:categoryCount(breakdown,'equipment'),vehicles:categoryCount(breakdown,'vehicles'),otherVehicles:categoryCount(breakdown,'otherVehicles')},
    oem,balance:breakdown.length-oem,bdPercent:records.length?breakdown.length/records.length*100:0,lmv:lmvCounts(lmvs)};
}
export function totalFleetDetailRows(records=[],requests=[]) {
  return fleetAssetRequestDetails(records.map(record=>({...record,dashboardRoadStatus:record.fleetRoadStatus})),requests).map(record=>({...record,
    lmvRoadStatus:record.fleetRoadStatus,lmvOemBreakdown:record.fleetOem,
    requestStatus:record.demo===true?`Demo · ${{onroad:'On road',offroad:'Breakdown',idle:'Idle',unknown:'Needs review'}[record.fleetRoadStatus]||'Unknown'}`:record.requestStatus,
  }));
}
export const TOTAL_FLEET_DETAIL_COLUMNS=[
  ...LMV_DETAIL_COLUMNS.filter(column=>!['status','source','oem'].includes(column.key)),
  {key:'category',label:'Asset category',value:row=>row.fleetCategory==='otherVehicles'?'Other vehicles / LMV':row.fleetCategory==='vehicles'?'Vehicles':'Equipment'},
  {key:'status',label:'Current status',value:row=>row.requestStatus},
  {key:'oem',label:'OEM BD',value:row=>row.fleetOem?'Yes':'No'},
  {key:'reference',label:'Job reference',value:row=>row.requestReference||'—'},
  {key:'start',label:'Started',value:row=>row.requestStart||'—'},
  {key:'reason',label:'Breakdown reason',value:row=>row.demo===true?'DEMO — sample status':row.breakdownReason||'—'},
  {key:'source',label:'Data source',value:row=>row.demo===true?'DEMO — sample vehicle and status':row.fleetSource},
];

// Presentation rows only: no synthetic maintenance cases or request references.
export function totalFleetOemChartRows(records=[]) {
  return records.filter(record=>record.fleetOem).map(record=>({id:record.fleetKey,record,site:record.currentLocation||record.location||record.site,
    oem:record.make||record.oem||'OEM not specified',oemKey:normalized(record.make||record.oem||'OEM not specified'),
    equipmentGroup:equipmentGroupValue(record)||record.itemName||'LMV',equipmentGroupKey:normalized(equipmentGroupValue(record)||record.itemName||'LMV'),requests:[],
  }));
}
