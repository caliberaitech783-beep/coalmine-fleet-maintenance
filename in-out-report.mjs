import {elapsedMilliseconds} from './report-metrics.mjs';

export const IN_OUT_REPORT_TITLE='In and Out Report';
export const IN_OUT_REPORT_DESCRIPTION='Day-wise register of vehicles that came in for breakdown (opened), went out after maintenance (closed), were MIS verified or marked idle, with the balance still in workshop at day end.';
export const IN_OUT_REPORT_MAX_DAYS=366;

const INDIA_OFFSET_MS=330*60*1000;
const WEEKDAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const VEHICLE_LIST_LIMIT=8;
const clean=(value)=>String(value??'').trim();

export function indiaDateKey(value=new Date()){
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime()))return '';
  return new Date(date.getTime()+INDIA_OFFSET_MS).toISOString().slice(0,10);
}

export function eventDateKey(value){
  return clean(value).match(/^(\d{4}-\d{2}-\d{2})/)?.[1]||'';
}

export function isIdleRequest(record={}){
  return ['idle','ideal'].includes(clean(record.status).toLowerCase());
}

export function requestEventDateKey(record={},event){
  if(event==='opened')return eventDateKey(record.start)||eventDateKey(record.startedAt)||eventDateKey(record.createdAt);
  if(event==='closed')return eventDateKey(record.closedAt);
  if(event==='verified')return eventDateKey(record.verifiedAt);
  return eventDateKey(record.closedAt)||eventDateKey(record.start);
}

export function inOutWeekday(dateKey){
  const date=new Date(`${dateKey}T12:00:00Z`);
  return Number.isNaN(date.getTime())?'':WEEKDAYS[date.getUTCDay()];
}

function shiftDateKey(dateKey,days){
  const date=new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}

function vehicleLabel(record={}){
  return clean(record.reportEquipment)||clean(record.equipment)||clean(record.equipmentName)||clean(record.door)||clean(record.reg)||clean(record.chassis)||clean(record.ref)||'Unknown vehicle';
}

function siteLabel(record={}){
  return clean(record.reportSite)||clean(record.site)||clean(record.currentLocation)||clean(record.location)||'Not assigned';
}

export function vehicleListLabel(records=[],limit=VEHICLE_LIST_LIMIT){
  const names=records.map(vehicleLabel);
  if(!names.length)return '';
  const shown=names.slice(0,limit);
  const remaining=names.length-shown.length;
  return remaining>0?`${shown.join(', ')} +${remaining} more`:shown.join(', ');
}

export function locationCountLabel(records=[]){
  const counts=new Map();
  for(const record of records){
    const site=siteLabel(record);
    counts.set(site,(counts.get(site)||0)+1);
  }
  return [...counts.entries()]
    .sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))
    .map(([site,count])=>`${site} (${count})`)
    .join(', ');
}

export function signedCount(value){
  const number=Number(value)||0;
  return number>0?`+${number}`:String(number);
}

export function minutesLabel(minutes){
  if(!Number.isFinite(minutes)||minutes<0)return '—';
  const total=Math.round(minutes);
  const days=Math.floor(total/1440);
  const hours=Math.floor((total%1440)/60);
  const rest=total%60;
  const parts=[];
  if(days)parts.push(`${days}d`);
  if(hours||days)parts.push(`${hours}h`);
  parts.push(`${rest}m`);
  return parts.join(' ');
}

function leftDateKey(record){
  return eventDateKey(record.closedAt)||(isIdleRequest(record)?requestEventDateKey(record,'opened'):'');
}

export function buildInOutReportRows(requests=[],{today=new Date(),maxDays=IN_OUT_REPORT_MAX_DAYS}={}){
  const todayKey=typeof today==='string'?today:indiaDateKey(today);
  const events=requests.map((record)=>({
    record,
    opened:requestEventDateKey(record,'opened'),
    closed:isIdleRequest(record)?'':requestEventDateKey(record,'closed'),
    verified:requestEventDateKey(record,'verified'),
    idle:isIdleRequest(record)?requestEventDateKey(record,'idle'):'',
    left:leftDateKey(record),
  }));
  const eventKeys=events.flatMap((event)=>[event.opened,event.closed,event.verified,event.idle]).filter(Boolean).filter((key)=>key<=todayKey);
  const earliest=eventKeys.length?eventKeys.reduce((min,key)=>key<min?key:min):todayKey;
  const floor=shiftDateKey(todayKey,-(Math.max(1,maxDays)-1));
  const startKey=earliest<floor?floor:earliest;
  const rows=[];
  for(let cursor=startKey;cursor<=todayKey&&rows.length<maxDays;cursor=shiftDateKey(cursor,1)){
    const date=cursor;
    const opened=events.filter((event)=>event.opened===date);
    const closed=events.filter((event)=>event.closed===date);
    const verified=events.filter((event)=>event.verified===date);
    const idle=events.filter((event)=>event.idle===date);
    const pendingClose=events.filter((event)=>event.opened&&event.opened<=date&&!(event.left&&event.left<=date)).length;
    const pendingVerification=events.filter((event)=>event.left&&event.left<=date&&!(event.verified&&event.verified<=date)).length;
    const tatMinutes=closed.map((event)=>elapsedMilliseconds(event.record.start,event.record.closedAt)).filter((value)=>value!==null).map((value)=>value/60000);
    const tatMinutesTotal=tatMinutes.reduce((total,value)=>total+value,0);
    const averageTatMinutes=tatMinutes.length?tatMinutesTotal/tatMinutes.length:null;
    rows.push({
      date,
      weekday:inOutWeekday(date),
      opened:opened.length,
      closed:closed.length,
      verified:verified.length,
      idle:idle.length,
      net:opened.length-closed.length,
      pendingClose,
      pendingVerification,
      tatCount:tatMinutes.length,
      tatMinutesTotal,
      averageTatMinutes,
      averageTat:averageTatMinutes===null?'—':minutesLabel(averageTatMinutes),
      inVehicles:vehicleListLabel(opened.map((event)=>event.record)),
      outVehicles:vehicleListLabel(closed.map((event)=>event.record)),
      inLocations:locationCountLabel(opened.map((event)=>event.record)),
      outLocations:locationCountLabel(closed.map((event)=>event.record)),
    });
  }
  return rows.reverse();
}

export function summarizeInOutReport(rows=[]){
  const latest=rows[0]||null;
  const total=(key)=>rows.reduce((sum,row)=>sum+(Number(row[key])||0),0);
  const opened=total('opened');
  const closed=total('closed');
  const tatCount=total('tatCount');
  const tatMinutesTotal=total('tatMinutesTotal');
  const busiest=(key)=>rows.reduce((best,row)=>(row[key]>(best?.[key]||0)?row:best),null);
  const busiestIn=busiest('opened');
  const busiestOut=busiest('closed');
  return {
    days:rows.length,
    from:rows.length?rows[rows.length-1].date:'',
    to:latest?.date||'',
    opened,
    closed,
    verified:total('verified'),
    idle:total('idle'),
    net:opened-closed,
    pendingClose:latest?.pendingClose||0,
    pendingVerification:latest?.pendingVerification||0,
    averageTatMinutes:tatCount?tatMinutesTotal/tatCount:null,
    averageTat:tatCount?minutesLabel(tatMinutesTotal/tatCount):'—',
    busiestInDay:busiestIn&&busiestIn.opened?busiestIn.date:'',
    busiestOutDay:busiestOut&&busiestOut.closed?busiestOut.date:'',
  };
}

export const IN_OUT_REPORT_COLUMNS=[
  {key:'date',label:'Date',value:(row)=>row.date},
  {key:'weekday',label:'Day',value:(row)=>row.weekday},
  {key:'opened',label:'In (opened)',value:(row)=>row.opened},
  {key:'inVehicles',label:'Vehicles in',value:(row)=>row.inVehicles},
  {key:'closed',label:'Out (closed)',value:(row)=>row.closed},
  {key:'outVehicles',label:'Vehicles out',value:(row)=>row.outVehicles},
  {key:'verified',label:'MIS verified',value:(row)=>row.verified},
  {key:'idle',label:'Idle vehicles',value:(row)=>row.idle},
  {key:'net',label:'Net movement (in − out)',value:(row)=>signedCount(row.net)},
  {key:'pendingClose',label:'Still in workshop at day end',value:(row)=>row.pendingClose},
  {key:'pendingVerification',label:'Awaiting MIS verification at day end',value:(row)=>row.pendingVerification},
  {key:'averageTat',label:'Avg. turnaround of closures',value:(row)=>row.averageTat},
  {key:'inLocations',label:'In by location',value:(row)=>row.inLocations},
  {key:'outLocations',label:'Out by location',value:(row)=>row.outLocations},
];
