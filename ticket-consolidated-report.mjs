import {canonicalSiteName} from './site-location.mjs';

export const TICKET_REPORT_HOURS=[8,15,20];
const INDIA_OFFSET_MS=330*60*1000;

function zonedParts(date){
  const shifted=new Date(date.getTime()+INDIA_OFFSET_MS);
  return {year:shifted.getUTCFullYear(),month:shifted.getUTCMonth(),day:shifted.getUTCDate(),hour:shifted.getUTCHours()};
}

function indiaSlotDate({year,month,day},hour){return new Date(Date.UTC(year,month,day,hour)-INDIA_OFFSET_MS)}

export function ticketReportWindow(now=new Date()){
  const local=zonedParts(now);
  let index=TICKET_REPORT_HOURS.findLastIndex((hour)=>hour<=local.hour);
  let endDay={year:local.year,month:local.month,day:local.day};
  if(index<0){
    index=TICKET_REPORT_HOURS.length-1;
    const yesterday=new Date(Date.UTC(local.year,local.month,local.day)-86400000);
    endDay={year:yesterday.getUTCFullYear(),month:yesterday.getUTCMonth(),day:yesterday.getUTCDate()};
  }
  const endHour=TICKET_REPORT_HOURS[index];
  const end=indiaSlotDate(endDay,endHour);
  let startDay=endDay,startIndex=index-1;
  if(startIndex<0){
    startIndex=TICKET_REPORT_HOURS.length-1;
    const yesterday=new Date(Date.UTC(endDay.year,endDay.month,endDay.day)-86400000);
    startDay={year:yesterday.getUTCFullYear(),month:yesterday.getUTCMonth(),day:yesterday.getUTCDate()};
  }
  const start=indiaSlotDate(startDay,TICKET_REPORT_HOURS[startIndex]);
  const slotKey=`CRM-${endDay.year}-${String(endDay.month+1).padStart(2,'0')}-${String(endDay.day).padStart(2,'0')}-${String(endHour).padStart(2,'0')}`;
  return {start,end,endHour,slotKey};
}

export function ticketReportDue(now=new Date(),graceMinutes=20){
  const window=ticketReportWindow(now),delay=now.getTime()-window.end.getTime();
  return delay>=0&&delay<=graceMinutes*60*1000;
}

const durationLabel=(milliseconds)=>{
  const minutes=Math.max(0,Math.floor(Number(milliseconds||0)/60000));
  const days=Math.floor(minutes/1440),hours=Math.floor((minutes%1440)/60),mins=minutes%60;
  return `${days?`${days}d `:''}${hours}h ${mins}m`;
};

export function prepareTicketReportRows(tickets=[],reportTime=new Date()){
  return tickets.map((ticket)=>{
    const openedAt=new Date(ticket.openedAt||ticket.createdAt);
    const resolvedAt=ticket.resolvedAt?new Date(ticket.resolvedAt):null;
    const elapsedMs=Math.max(0,(resolvedAt&&!Number.isNaN(resolvedAt.getTime())?resolvedAt:reportTime)-openedAt);
    return {...ticket,site:canonicalSiteName(ticket.site)||'Not assigned',elapsedMs,elapsed:durationLabel(elapsedMs)};
  }).sort((left,right)=>right.elapsedMs-left.elapsedMs);
}

const indiaDateTime=(value)=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}).format(value);
const ticketLines=(ticket,index,closed=false)=>[
  `${index+1}. *${ticket.reference||'Ticket'}* — *${ticket.elapsed}*`,
  `   ${closed?'Time taken':'Time lapsed'}: ${ticket.elapsed}`,
  `   User: ${ticket.user||'Not assigned'}`,
  `   Remarks: ${ticket.remarks||'No description provided'}`,
].join('\n');

export function buildTicketWhatsAppReport({scopeLabel='Site',start,end,openTickets=[],closedTickets=[],maxLength=3900}){
  const sites=[...new Set([...openTickets,...closedTickets].map(({site})=>canonicalSiteName(site)||'Not assigned'))].sort();
  const sections=[];
  if(!sites.length)sections.push('\n✅ *NO CRM TICKET ACTIVITY IN THIS WINDOW*');
  for(const site of sites){
    const opened=openTickets.filter((row)=>row.site===site);
    const closed=closedTickets.filter((row)=>row.site===site);
    sections.push(`\n━━━━━━━━━━━━━━━━━━\n📍 *${site.toUpperCase()}*\n━━━━━━━━━━━━━━━━━━`);
    sections.push(`🔴 *OPEN TICKETS (${opened.length})*`);
    sections.push(opened.length?opened.map((row,index)=>ticketLines(row,index)).join('\n'):'No open tickets.');
    sections.push(`🟢 *CLOSED TICKETS (${closed.length})*`);
    sections.push(closed.length?closed.map((row,index)=>ticketLines(row,index,true)).join('\n'):'No closed tickets.');
  }
  let message=[
    '🎫 *NERVE CENTER CRM TICKET REPORT*',
    `*SCOPE:* ${scopeLabel}`,
    `*WINDOW:* ${indiaDateTime(start)} – ${indiaDateTime(end)}`,
    `*GENERATED:* ${indiaDateTime(end)}`,
    ...sections,
  ].join('\n');
  if(message.length>maxLength)message=`${message.slice(0,maxLength-105).trimEnd()}\n\n*Additional tickets omitted.* Open Nerve Center for the complete list.`;
  return message;
}
