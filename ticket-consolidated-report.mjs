import {canonicalSiteName} from './site-location.mjs';
import {formatDisplayDateTime} from './date-time-format.mjs';

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

const indiaDateTime=(value)=>formatDisplayDateTime(value);
export function buildTicketReportTable({scopeLabel='Site',start,end,openTickets=[],closedTickets=[]}) {
  const columns=['Ticket reference','Site','Status','Raised by','Remarks','Opened at (IST)','Resolved at (IST)','Elapsed time','Report scope','Window start (IST)','Window end (IST)'].map(label=>({label}));
  const date=value=>value&&!Number.isNaN(new Date(value).getTime())?indiaDateTime(new Date(value)):'';
  const rows=[...openTickets,...closedTickets].map(ticket=>[
    ticket.reference||'',ticket.site||'Not assigned',ticket.resolvedAt?'Resolved':ticket.status||'Open',ticket.user||'',ticket.remarks||'',
    date(ticket.openedAt||ticket.createdAt),date(ticket.resolvedAt),ticket.elapsed||'',scopeLabel,date(start),date(end),
  ]);
  return {title:'CRM consolidated report',columns,rows};
}

export function buildTicketWhatsAppReport({scopeLabel='Site',start,end,openTickets=[],closedTickets=[],pdfUrl,xlsxUrl}){
  for(const link of [pdfUrl,xlsxUrl])if(!link||!/^https?:\/\//.test(link))throw new Error('CRM consolidated reports require PDF and Excel download links.');
  return [
    'NERVE CENTER CRM CONSOLIDATED REPORT',`SCOPE: ${scopeLabel}`,
    `WINDOW: ${indiaDateTime(start)} – ${indiaDateTime(end)}`,
    `OPEN TICKETS: ${openTickets.length} | CLOSED TICKETS: ${closedTickets.length}`,
    `PDF: ${pdfUrl}`,`Excel: ${xlsxUrl}`,'Open the files for complete ticket details. Links expire in 14 days.',
  ].join('\n');
}
