import {REGION_DATA} from './region-scope.mjs';
import {recordBelongsToSite} from './site-location.mjs';
import {equipmentRoadStatus,createFleetAssetResolver} from './dashboard-equipment-metrics.mjs';
import {dashboardFleetSnapshot} from './dashboard-fleet-snapshot.mjs';

export const LMV_COLOR = '#14b8a6';
export const LMV_DEMO_SEED = 'lmv_demo_fleet_5_per_site_v1';
export function lmvDemoRecords() {
  const models=[['Mahindra','Bolero'],['Tata','Safari'],['Maruti Suzuki','Eeco'],['Mahindra','Scorpio'],['Tata','Xenon']];
  return REGION_DATA.flatMap(region=>region.sites.flatMap((site,siteIndex)=>models.map(([make,model],index)=>{
    const door=`DEMO-LMV-${region.code}-${siteIndex+1}-${index+1}`;
    return {door,equipmentName:door,reg:door,currentLocation:site,category:'Other vehicles',group:'LMV',itemName:'Light motor vehicle',itemSpecification:`DEMO ${model}`,make,model,manufacturerSerialNo:`${door}-SERIAL`,chassisNo:`${door}-CHASSIS`,engineNo:`${door}-ENGINE`,asset:door,documentStatus:'Demo only',status:index<2?'Operational':index===2?'Idle':'Off road',demo:true,demoOemBreakdown:index===4,demoLabel:'Demo vehicle — sample status'};
  })));
}

// Called inside the existing schema migration transaction and advisory lock.
// A durable marker means deleted demo rows are never recreated on restart.
export async function seedLmvDemoRecords(client) {
  const marker=await client.query('SELECT value FROM app_metadata WHERE key=$1 FOR UPDATE',[LMV_DEMO_SEED]);
  if(marker.rows.length)return 0;
  const records=lmvDemoRecords();
  for(const record of records)await client.query("INSERT INTO master_records (master_name,record_data) VALUES ('LMV master',$1::jsonb)",[JSON.stringify(record)]);
  await client.query("INSERT INTO app_metadata (key,value,updated_at) VALUES ($1,'true',NOW()) ON CONFLICT (key) DO NOTHING",[LMV_DEMO_SEED]);
  return records.length;
}

export function lmvFleetSnapshot(records=[],requests=[]) {
  const snapshots=dashboardFleetSnapshot(records,requests);
  const resolve=createFleetAssetResolver(records);
  const oemIndexes=new Set();
  const activeIndexes=new Set();
  for(const request of requests){
    if(String(request.status||'').toLowerCase()==='closed'&&!request.vehicleIdle)continue;
    const match=resolve(request,{allowTransferred:true});
    if(match.assetIndex===null)continue;
    activeIndexes.add(match.assetIndex);
    if(request.oemResponsibility==='OEM'||(request.oemResponsibility!=='NON OEM'&&/\boem\b/i.test(request.delayedReason||'')))oemIndexes.add(match.assetIndex);
  }
  return snapshots.map((record,index)=>{
    // Samples are explicitly marked; their demonstration statuses never become
    // operational requests. Real LMVs use the same live snapshot as equipment.
    const roadStatus=record.demo===true&&!activeIndexes.has(index)&&!record.dashboardStatusWarning?equipmentRoadStatus(record):record.dashboardRoadStatus;
    return {...record,lmvRoadStatus:roadStatus,lmvOemBreakdown:roadStatus==='offroad'&&(oemIndexes.has(index)||(record.demo===true&&record.demoOemBreakdown===true))};
  });
}

export function lmvCounts(records=[]) {
  const count=status=>records.filter(record=>record.lmvRoadStatus===status).length;
  const breakdown=count('offroad'),oem=records.filter(record=>record.lmvRoadStatus==='offroad'&&record.lmvOemBreakdown).length;
  return {total:records.length,onroad:count('onroad'),idle:count('idle'),unknown:count('unknown'),breakdown,oem,balance:breakdown-oem,bdPercent:records.length?breakdown/records.length*100:0,demo:records.filter(record=>record.demo===true).length};
}
export function lmvRowsForMode(records=[],mode='total') {
  if(mode==='balance')return records.filter(record=>record.lmvRoadStatus==='offroad'&&!record.lmvOemBreakdown);
  if(mode==='oem')return records.filter(record=>record.lmvRoadStatus==='offroad'&&record.lmvOemBreakdown);
  if(mode==='breakdown')return records.filter(record=>record.lmvRoadStatus==='offroad');
  if(['onroad','idle','unknown'].includes(mode))return records.filter(record=>record.lmvRoadStatus===mode);
  return records;
}
export function lmvSiteSummary(records=[],regions=REGION_DATA) {
  return regions.map(region=>({...region,sites:region.sites.map(site=>({name:typeof site==='string'?site:site.name,...lmvCounts(records.filter(record=>recordBelongsToSite(record,typeof site==='string'?site:site.name)))}))}));
}
export const LMV_DETAIL_COLUMNS=[
  {key:'site',label:'Site name',value:row=>row.currentLocation||row.location||row.site},
  {key:'door',label:'Door / registration',value:row=>row.door||row.equipmentName},
  {key:'make',label:'Make',value:row=>row.make},
  {key:'model',label:'Model',value:row=>row.model},
  {key:'group',label:'Equipment group',value:row=>row.group||'LMV'},
  {key:'chassis',label:'Chassis no.',value:row=>row.chassisNo||row.manufacturerSerialNo},
  {key:'status',label:'Road status',value:row=>({onroad:'On road',offroad:'Breakdown',idle:'Idle',unknown:'Needs identity review'}[row.lmvRoadStatus]||'Status not set')},
  {key:'oem',label:'OEM BD',value:row=>row.lmvOemBreakdown?'Yes':'No'},
  {key:'source',label:'Data source',value:row=>row.demo===true?'DEMO — sample vehicle and status':'Live LMV master'},
];
export const LMV_SUMMARY_COLUMNS=[
  {key:'region',label:'Region',value:row=>row.region},{key:'name',label:'Site name',value:row=>row.name},
  ...[['total','Total LMV'],['breakdown','LMV BD'],['balance','LMV BD Balance'],['oem','LMV OEM BD'],['onroad','LMV on road'],['idle','LMV idle'],['unknown','Needs review'],['demo','Demo LMVs']].map(([key,label])=>({key,label,value:row=>row[key]})),
  {key:'bdPercent',label:'LMV BD (%)',value:row=>row.bdPercent.toFixed(1)},
];
export function lmvSummaryRows(records=[],regions=REGION_DATA) {
  return [...lmvSiteSummary(records,regions).flatMap(region=>[...region.sites.map(site=>({...site,region:region.code})),{name:`${region.code} total`,region:region.code,...lmvCounts(records.filter(record=>region.sites.some(site=>recordBelongsToSite(record,site.name))))}]),{name:'All selected sites',region:'Total',...lmvCounts(records)}];
}
