import {canonicalSiteName} from './site-location.mjs';

export const TICKET_REPORT_HOURS=[8,15,20];
const INDIA_OFFSET_MS=330*60*1000;

export function ticketReportWindow(now=new Date(),settings={}){
  const times=settings.times??TICKET_REPORT_HOURS.map(hour=>`${String(hour).padStart(2,'0')}:00`);
  const days=settings.days??[0,1,2,3,4,5,6];
  const slots=[];
  for(let age=0;age<=15;age++){
    const local=new Date(now.getTime()+INDIA_OFFSET_MS-age*86400000);
    if(!days.includes(local.getUTCDay()))continue;
    const day=local.toISOString().slice(0,10);
    for(const time of new Set(times)){
      if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))continue;
      const end=new Date(`${day}T${time}:00+05:30`);
      if(end<=now)slots.push({end,time,day});
    }
  }
  slots.sort((a,b)=>b.end-a.end);
  if(slots.length<2)return null;
  const [{end,time,day},{end:start}]=slots;
  const endHour=Number(time.slice(0,2));
  const timeKey=time.endsWith(':00')?time.slice(0,2):time.replace(':','');
  return {start,end,endHour,slotKey:`CRM-${day}-${timeKey}`};
}

export function ticketReportDue(now=new Date(),graceMinutes=20,settings={}){
  const window=ticketReportWindow(now,settings);
  if(!window)return false;
  const delay=now.getTime()-window.end.getTime();
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
