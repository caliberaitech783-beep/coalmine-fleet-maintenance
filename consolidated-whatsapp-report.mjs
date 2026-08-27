import {canonicalSiteName} from './site-location.mjs';

export const CONSOLIDATED_REPORT_HOURS=[6,10,14,18,22];
const INDIA_OFFSET_MS=330*60*1000;

function zonedParts(date){
  const shifted=new Date(date.getTime()+INDIA_OFFSET_MS);
  return {year:shifted.getUTCFullYear(),month:shifted.getUTCMonth(),day:shifted.getUTCDate(),hour:shifted.getUTCHours()};
}

function indiaSlotDate({year,month,day},hour){return new Date(Date.UTC(year,month,day,hour)-INDIA_OFFSET_MS)}

export function consolidatedReportWindow(now=new Date()){
  const local=zonedParts(now);
  let index=CONSOLIDATED_REPORT_HOURS.findLastIndex((hour)=>hour<=local.hour);
  let endDay={year:local.year,month:local.month,day:local.day};
  if(index<0){
    index=CONSOLIDATED_REPORT_HOURS.length-1;
    const yesterday=new Date(Date.UTC(local.year,local.month,local.day)-86400000);
    endDay={year:yesterday.getUTCFullYear(),month:yesterday.getUTCMonth(),day:yesterday.getUTCDate()};
  }
  const endHour=CONSOLIDATED_REPORT_HOURS[index];
  const end=indiaSlotDate(endDay,endHour);
  let startDay=endDay;
  let startIndex=index-1;
  if(startIndex<0){
    startIndex=CONSOLIDATED_REPORT_HOURS.length-1;
    const yesterday=new Date(Date.UTC(endDay.year,endDay.month,endDay.day)-86400000);
    startDay={year:yesterday.getUTCFullYear(),month:yesterday.getUTCMonth(),day:yesterday.getUTCDate()};
  }
  const start=indiaSlotDate(startDay,CONSOLIDATED_REPORT_HOURS[startIndex]);
  const slotKey=`${endDay.year}-${String(endDay.month+1).padStart(2,'0')}-${String(endDay.day).padStart(2,'0')}-${String(endHour).padStart(2,'0')}`;
  return {start,end,endHour,slotKey};
}

export function consolidatedReportDue(now=new Date(),graceMinutes=20){
  const window=consolidatedReportWindow(now);
  const delay=now.getTime()-window.end.getTime();
  return delay>=0&&delay<=graceMinutes*60*1000;
}

const durationLabel=(milliseconds)=>{
  const minutes=Math.max(0,Math.floor(Number(milliseconds||0)/60000));
  const days=Math.floor(minutes/1440),hours=Math.floor((minutes%1440)/60),mins=minutes%60;
  return `${days?`${days}d `:''}${hours}h ${mins}m`;
};

const requestKeys=(request={})=>[request.door,request.equipment,request.chassis].map((value)=>String(value||'').trim().toLowerCase()).filter(Boolean);
const equipmentKeys=(record={})=>[record.door,record.registration,record.reg,record.equipmentName,record.itemName,record.chassisNo,record.manufacturerSerialNo].map((value)=>String(value||'').trim().toLowerCase()).filter(Boolean);

export function attachRequestOems(requests=[],equipmentRecords=[]){
  const equipmentByKey=new Map();
  for(const record of equipmentRecords)for(const key of equipmentKeys(record))if(!equipmentByKey.has(key))equipmentByKey.set(key,record);
  return requests.map((request)=>{
    const equipment=requestKeys(request).map((key)=>equipmentByKey.get(key)).find(Boolean)||{};
    return {...request,oem:String(equipment.oem||equipment.make||equipment.manufacturer||'Not assigned').trim()||'Not assigned'};
  });
}

export function prepareConsolidatedRows(requests=[],reportTime=new Date()){
  return requests.map((request)=>{
    const startedAt=new Date(request.startedAt||request.start);
    const closedAt=request.closedAt?new Date(request.closedAt):null;
    const elapsedMs=Math.max(0,(closedAt&&!Number.isNaN(closedAt.getTime())?closedAt:reportTime)-startedAt);
    return {...request,site:canonicalSiteName(request.site)||'Not assigned',elapsedMs,elapsed:durationLabel(elapsedMs)};
  }).sort((left,right)=>right.elapsedMs-left.elapsedMs);
}

const indiaDateTime=(value)=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}).format(value);
const recordLines=(request,index,closed=false)=>[
  `${index+1}. *${request.door||request.equipment||'Door not assigned'}* — *${request.elapsed}*`,
  `   Request: ${request.reference||request.ref||'—'}`,
  `   User: ${request.user||request.owner||'Not assigned'}`,
  `   OEM: ${request.oem||'Not assigned'}`,
  closed
    ? `   Closed by: ${request.closedBy||'Not assigned'}`
    : `   Status: ${request.status||'Open'}${String(request.status||'').toLowerCase()==='idle'?` | Idle reason: ${request.idleReason||'Not assigned'}`:''}`,
].join('\n');

export function buildConsolidatedWhatsAppReport({scopeLabel='Site',start,end,openRequests=[],closedRequests=[],maxLength=3900}){
  const sites=[...new Set([...openRequests,...closedRequests].map(({site})=>canonicalSiteName(site)||'Not assigned'))].sort();
  const header=[
    '🚨 *NERVE CENTER CONSOLIDATED REPORT*',
    `*SCOPE:* ${scopeLabel}`,
    `*WINDOW:* ${indiaDateTime(start)} – ${indiaDateTime(end)}`,
    `*GENERATED:* ${indiaDateTime(end)}`,
  ].join('\n');
  const sections=[];
  if(!sites.length)sections.push('\n✅ *NO REQUEST ACTIVITY IN THIS WINDOW*');
  for(const site of sites){
    const opened=openRequests.filter((row)=>row.site===site);
    const closed=closedRequests.filter((row)=>row.site===site);
    sections.push(`\n📍 *${site.toUpperCase()}*`);
    sections.push(`🔴 *OFF ROAD / OPEN (${opened.length})*`);
    sections.push(opened.length?opened.map((row,index)=>recordLines(row,index)).join('\n'):'No open requests.');
    sections.push(`🟢 *ON ROAD / CLOSED (${closed.length})*`);
    sections.push(closed.length?closed.map((row,index)=>recordLines(row,index,true)).join('\n'):'No closed requests.');
  }
  let message=[header,...sections].join('\n');
  if(message.length>maxLength)message=`${message.slice(0,maxLength-105).trimEnd()}\n\n*Additional records omitted.* Open Nerve Center for the complete list.`;
  return message;
}
