import {createFleetAssetResolver,liveEquipmentRoadStatuses} from '../dashboard-equipment-metrics.mjs';
import {indiaDateTimeEpoch} from '../report-date-range.mjs';
import {isIdleVehicleRequest} from '../request-idle.mjs';

// Count actual off-road transitions, not request rows. Overlapping requests for
// one master asset form one off-road interval; a second repair after a real
// return to service is a new interval. Never manufacture a balancing event.
export function fleetMovementLedger(equipment=[],requests=[],from='',to='',{now=Date.now(),endingEquipment=equipment}={}){
 const lower=from?indiaDateTimeEpoch(from):-Infinity;
 const upper=to?Math.min(indiaDateTimeEpoch(to)+86400000,now+1):now+1;
 const rows={open:[],incoming:[],outgoing:[],balance:[],idle:[]};
 const issues=[];
 if(Number.isNaN(lower)||Number.isNaN(upper)||lower>=upper)return {rows,open:0,incoming:0,outgoing:0,balance:0,idle:0,verified:false,issues:['Invalid movement period.']};
 const resolve=createFleetAssetResolver(equipment),intervals=equipment.map(()=>[]);
 for(const request of requests){
  const start=indiaDateTimeEpoch(request.start||request.startedAt||request.createdAt);
  if(Number.isFinite(start)&&start>=upper)continue;
  const ends=[request.closedAt,request.completedAt,request.idealRequestedAt,request.idleRequestedAt,request.runningBdAt].map(indiaDateTimeEpoch).filter(Number.isFinite);
  const end=ends.length?Math.min(...ends):Infinity;
  if(end<lower)continue;
  const match=resolve(request,{allowTransferred:true});
  if(match.assetIndex===null){
   // An unmatchable historical request must not silently become a vehicle.
   issues.push('Request identity cannot be uniquely matched to the fleet.');continue;
  }
  if(!Number.isFinite(start)){issues.push('A request is missing its breakdown start time.');continue;}
  const status=String(request.status||'').trim().toLowerCase();
  if((status==='closed'||status==='running bd'||isIdleVehicleRequest(request))&&!Number.isFinite(end)){
   issues.push('A completed, idle or running-BD request is missing its status-change time.');continue;
  }
  if(end<start){issues.push('A status-change time precedes its breakdown start.');continue;}
  if(end===start)continue;
  intervals[match.assetIndex].push({start,end,request,endRequest:request});
 }
 const endStatuses=liveEquipmentRoadStatuses(endingEquipment,requests);
 for(let index=0;index<equipment.length;index++){
  const merged=[];
  for(const interval of intervals[index].sort((a,b)=>a.start-b.start)){
   const prior=merged.at(-1);
   if(prior&&interval.start<=prior.end){if(interval.end>prior.end){prior.end=interval.end;prior.endRequest=interval.endRequest;}}
   else merged.push({...interval});
  }
  for(const interval of merged){
   if(interval.start<lower&&interval.end>=lower)rows.open.push(interval.request);
   if(interval.start>=lower&&interval.start<upper)rows.incoming.push(interval.request);
   if(interval.end>=lower&&interval.end<upper)rows.outgoing.push(interval.endRequest);
  }
  const asset=endingEquipment[index];
  if(endStatuses[index]==='unknown')issues.push('A fleet asset has an unresolved availability status.');
  if(endStatuses[index]==='offroad')rows.balance.push(asset);
  if(endStatuses[index]==='idle')rows.idle.push(asset);
  const replayed=merged.some(interval=>interval.start<upper&&interval.end>=upper);
  if(replayed!==(endStatuses[index]==='offroad'))issues.push('Recorded transitions disagree with the availability snapshot.');
 }
 const result=Object.fromEntries(Object.entries(rows).map(([key,value])=>[key,value.length]));
 const reconciled=result.open+result.incoming-result.outgoing===result.balance;
 return {...result,total:equipment.length,onRoad:endStatuses.filter(status=>status==='onroad').length,unknown:endStatuses.filter(status=>status==='unknown').length,rows,verified:!issues.length&&reconciled,issues:[...new Set(issues)],reconciled};
}
