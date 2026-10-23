import {resolveShiftForTimestamp} from './shift-report-time.mjs';
import {formatDisplayDate,formatDisplayTime,indiaCalendarDateKey} from './date-time-format.mjs';
import {indiaDateTimeEpoch} from './report-date-range.mjs';
import {normalizeShiftRecord} from './shift-master.mjs';
import {canonicalSiteName} from './site-location.mjs';

const clean=(v,fallback='Not recorded')=>String(v??'').replace(/[\r\n]+/g,' ').trim()||fallback;
const time=value=>formatDisplayTime(`2000-01-01 ${value}`,'Not recorded');
const when=value=>value?`${formatDisplayDate(value)} (${formatDisplayTime(value)})`:'Not recorded';
export function telegramShiftLines(site,eventTime,shifts=[]){
  const shift=resolveShiftForTimestamp(eventTime,{site,shifts});
  return [`Shift: ${shift?clean(shift.shiftName):'Not recorded'}`,`Shift timing: ${shift?`${time(shift.startTime)} to ${time(shift.endTime)} IST`:'Not recorded'}`];
}
function duration(request,end){
  const minutes=Math.floor((indiaDateTimeEpoch(end)-indiaDateTimeEpoch(request.start||request.startedAtRaw||request.startedAt))/60000);
  if(!Number.isFinite(minutes)||minutes<0)return 'Not recorded';
  const days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60),mins=minutes%60;
  return [days&&`${days} ${days===1?'day':'days'}`,hours&&`${hours} hrs`,(mins||!days&&!hours)&&`${mins} mins`].filter(Boolean).join(' ');
}

// Telegram alone uses this layout. WhatsApp provider templates remain separate.
export function telegramNotificationText({purpose='',reference='',message='',site='',request={},ticket={},context={},shifts=[]}={}){
  const r=request,ref=clean(r.ref||reference),siteName=clean(site||r.site||ticket.site);
  const firstTrip=/^First trip entry pending/.test(message),running=/marked Running BD/.test(message),approved=/was approved on road/.test(message);
  let type=firstTrip?'firstTrip':running?'running':approved?'approved':purpose;
  const eventTime=type==='requestOpened'?r.start||r.startedAtRaw:type==='requestVerified'?r.verifiedAt||r.verifiedAtRaw:type==='dailyUpdate'?context.updatedAt:type==='requestIdle'||type==='idleReminder'?r.idealRequestedAt||r.idleAtRaw:type==='offRoadEscalation'?r.start||r.startedAtRaw:type==='running'?r.runningBdAt||r.runningBdAtRaw:type==='approved'?r.idealApprovedAt:type==='ticketCreated'?ticket.createdAt:type==='ticketResolved'?ticket.resolvedAt:r.closedAt||r.closedAtRaw;
  const heading=[`SITE: ${siteName}`];
  const door=`Door: ${clean(r.door)}`,requestLine=`Request ${ref}`;
  let body;
  switch(type){
    case 'requestOpened':body=['🔴 P to M',`Opening date & time: ${when(eventTime)}`,door,`Breakdown: ${clean(r.category)}`,`Opened by: ${clean(r.owner||r.openedBy)}`,requestLine];break;
    case 'requestClosed':body=['🟢 M to P',`Closing date & time: ${when(eventTime)}`,`BD duration: ${duration(r,eventTime)}`,door,`Breakdown: ${clean(r.category)}`,`Maintenance work: ${clean(r.maintenanceWork)}`,`Closed by: ${clean(r.closedBy)}`,requestLine];break;
    case 'running':body=['Running BD',`Handoff date & time: ${when(eventTime)}`,door,`Maintenance work: ${clean(r.maintenanceWork)}`,`Updated by: ${clean(context.updatedBy||message.match(/ by (.+?) at /)?.[1])}`,'MIS verification required','Ticket remains open until all issues are fixed',requestLine];break;
    case 'requestIdle':body=['Idle approval required',door,`Idle reason: ${clean(r.idleReason)}`,`Marked by: ${clean(r.idealRequestedBy)}`,'Action: Project Manager or Production Manager to approve Make On Road',requestLine];break;
    case 'approved':body=['Idle approved on road',`Approval date & time: ${when(r.idealApprovedAt||eventTime)}`,`Approved by: ${clean(r.idealApprovedBy||r.closedBy)}`,'MIS verification pending',requestLine];break;
    case 'firstTrip':body=['First trip entry pending',`On-road date & time: ${when(eventTime)}`,door,`Made on road by: ${clean(r.closedBy)}`,'Action: Production to record first trip/work start',requestLine];break;
    case 'requestVerified':body=['MIS verified',`Verified by: ${clean(r.verifiedBy)}`,`First trip: ${r.firstTripDone?'Completed':'Pending'}`,requestLine];break;
    case 'dailyUpdate':body=[`Daily maintenance update ${message.includes('updated today')?'edited':'added'}`,`Updated by: ${clean(context.authorName||message.split(/ (?:updated today|added a)/)[0])}`,requestLine];break;
    case 'offRoadEscalation':case 'idleReminder':body=[type==='idleReminder'?'Idle reminder':'Off Road escalation',`${type==='idleReminder'?'Idle':'Off Road'} since: ${when(eventTime)}`,door,...(type==='idleReminder'?[`Idle reason: ${clean(r.idleReason)}`]:[]),requestLine];break;
    case 'ticketCreated':case 'ticketResolved':body=[`Ticket ${type==='ticketCreated'?'created':'resolved'}`,`Ticket ${clean(ticket.reference||reference)}`];break;
    default:return [`SITE: ${siteName}`,message].join('\n');
  }
  const url=context.url||(['running','offRoadEscalation','idleReminder'].includes(type)?`https://pulse.cmll.in/?request=${encodeURIComponent(r.ref||reference)}`:'');
  return [...heading,body[0],...telegramShiftLines(siteName,eventTime,shifts),...body.slice(1),...(url?[`Open request: ${url}`]:[])].join('\n');
}

export function telegramReportText({kind='Fleet',window,reports=[],shifts=[]}){
  return [`LOCATIONS: ${reports.map(r=>clean(r.site)).join(' | ')}`,`${kind} consolidated report`,`From: ${when(window.start)} IST`,`To: ${when(window.end)} IST`,'Shift: All shifts',...reports.flatMap(r=>{
    // Show each configured shift that overlaps the report dates, including overnight shifts.
    const from=indiaCalendarDateKey(window.start),to=indiaCalendarDateKey(window.end);
    const siteShifts=shifts.flatMap(s=>{try{return [normalizeShiftRecord(s)]}catch{return []}}).filter(s=>canonicalSiteName(s.site)===canonicalSiteName(r.site)&&s.status!=='Inactive'&&(!s.effectiveFrom||s.effectiveFrom<=to)&&(!s.effectiveTo||s.effectiveTo>=from));
    const labels=[...new Set(siteShifts.map(s=>`${clean(s.shiftName)} (${time(s.startTime)} to ${time(s.endTime)} IST)`))];
    return ['',`SITE: ${clean(r.site)}`,`Shift timing: ${labels.join(', ')||'Not recorded'}`,clean(r.summary),`PDF: ${r.pdfUrl}`,`Excel: ${r.xlsxUrl}`];
  })].join('\n');
}
