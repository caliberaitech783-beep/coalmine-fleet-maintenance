const INDIA_OFFSET_MS=330*60*1000;
const DAY_MS=24*60*60*1000;
const TIME_PATTERN=/^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function scheduledReportTimes(schedule={}){
  const supplied=Array.isArray(schedule.times)?schedule.times:[];
  const hours=Array.isArray(schedule.hours)?schedule.hours.map((hour)=>`${String(Number(hour)).padStart(2,'0')}:00`):[];
  return [...new Set((supplied.length?supplied:hours).map((time)=>String(time).trim()).filter((time)=>TIME_PATTERN.test(time)))].slice(0,6);
}

function recurrence(schedule){
  if(!schedule||schedule.enabled===false)return null;
  const explicit=['daily','weekly','interval'].includes(schedule.cadence);
  if(!explicit&&(schedule.eventBased||['event','every-event','every event'].includes(schedule.cadence)||(!schedule.cadence&&schedule.key==='every-event')))return null;
  const times=scheduledReportTimes(schedule).sort().reverse();
  if(!times.length)return null;
  const interval=schedule.cadence==='interval'||!explicit&&schedule.intervalDays!=null?Number(schedule.intervalDays):null;
  if(interval!=null&&(!Number.isInteger(interval)||interval<2||interval>31))return null;
  // `days` also accepts the CRM settings shape, with Sunday=0.
  const suppliedDays=schedule.weekdays??schedule.days;
  const days=Array.isArray(suppliedDays)?suppliedDays:
    (schedule.cadence==='weekly'||!explicit&&schedule.weekday!=null)?[schedule.weekday]:null;
  if(days&&(!days.length||days.some((day)=>!Number.isInteger(day)||day<0||day>6)))return null;
  return {times,interval,days};
}

function previousOccurrence(rule,at){
  const local=new Date(at+INDIA_OFFSET_MS);
  let day=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate());
  // Normally one day, seven days or at most two months. The larger limit also
  // accommodates an interval restricted to particular weekdays.
  for(let lookback=0;lookback<366*8;lookback++,day-=DAY_MS){
    const date=new Date(day);
    if(rule.days&&!rule.days.includes(date.getUTCDay()))continue;
    if(rule.interval&&date.getUTCDate()%rule.interval!==0)continue;
    for(const time of rule.times){
      const [hour,minute]=time.split(':').map(Number);
      const occurrence=day+(hour*60+minute)*60000-INDIA_OFFSET_MS;
      if(occurrence<=at)return occurrence;
    }
  }
  return null;
}

/**
 * Exact report data window for a schedule's latest occurrence at or before `now`.
 * Returns {start: Date, end: Date}, or null for disabled/event/invalid schedules.
 * All times are IST; `times` accepts HH:mm, or legacy integer `hours`.
 * Daily schedules may have multiple slots. Weekly schedules accept `weekday`
 * (Sunday=0) or `weekdays`; CRM's {days, times, enabled} shape works directly.
 * Intervals preserve the existing calendar rule: days N, 2N, ... of each month.
 * Month boundaries therefore use the previous actual due date, even when the
 * gap is not N days (e.g. Aug 30 -> Sep 3 for intervalDays=3).
 *
 * Query timestamps with `timestamp >= start && timestamp < end` ([start,end)).
 * `end` is the scheduled occurrence, never the scheduler's delayed run time.
 * Adjacent slots consequently meet without gaps or duplicate boundary events.
 * This helper does not enforce delivery grace; callers can use it for CRM or
 * personal overrides, and persist their own claim for that occurrence.
 */
export function scheduledReportWindow(schedule,now=new Date()){
  const rule=recurrence(schedule);
  const timestamp=now instanceof Date?now.getTime():NaN;
  if(!rule||!Number.isFinite(timestamp))return null;
  const end=previousOccurrence(rule,timestamp);
  if(end==null)return null;
  const start=previousOccurrence(rule,end-1);
  return start==null?null:{start:new Date(start),end:new Date(end)};
}

// Include every occurrence within the inclusive delivery grace, even if two
// minute slots overlap. Persist a claim per returned end to deduplicate polls.
export function scheduledReportWindowsDue(schedule,now=new Date(),graceMinutes=20){
  const grace=Number(graceMinutes);
  if(!Number.isFinite(grace)||grace<0)return [];
  const windows=[];
  let window=scheduledReportWindow(schedule,now);
  while(window&&now.getTime()-window.end.getTime()<=grace*60000){
    windows.push(window);
    window=scheduledReportWindow(schedule,new Date(window.end.getTime()-1));
  }
  return windows.reverse();
}
