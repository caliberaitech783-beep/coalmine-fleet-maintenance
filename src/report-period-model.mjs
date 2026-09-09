import {indiaDateTimeInputValue} from '../report-date-range.mjs';

export const PERIOD_PRESETS = [
  ['today','Today'],['yesterday','Yesterday'],['last7','Last 7 days'],
  ['thisWeek','This week'],['lastWeek','Last week'],['fortnight','Fortnight'],
  ['last30','Last 30 days'],['thisMonth','This month'],['lastMonth','Last month'],
  ['thisQuarter','This quarter'],['thisYear','This year'],
];
export const indiaToday = (now = new Date()) => indiaDateTimeInputValue(now).slice(0,10);
const utc = date => new Date(`${date}T00:00:00Z`);
const iso = date => date.toISOString().slice(0,10);
export const shiftDay = (date, count) => iso(new Date(utc(date).getTime()+count*86400000));
export function shiftMonth(month, count) {
  const date=utc(`${month}-01`);
  date.setUTCMonth(date.getUTCMonth()+count);
  return iso(date).slice(0,7);
}
export function presetDates(key, today=indiaToday()) {
  const date=utc(today), monday=shiftDay(today,-((date.getUTCDay()+6)%7));
  let start=today,end=today;
  switch(key) {
    case 'today': break;
    case 'yesterday': start=end=shiftDay(today,-1); break;
    case 'last7': start=shiftDay(today,-6); break;
    case 'thisWeek': start=monday; break;
    case 'lastWeek': start=shiftDay(monday,-7);end=shiftDay(monday,-1);break;
    case 'fortnight': start=shiftDay(today,-13);break;
    case 'last30': start=shiftDay(today,-29);break;
    case 'thisMonth': start=`${today.slice(0,7)}-01`;break;
    case 'lastMonth': start=`${shiftMonth(today.slice(0,7),-1)}-01`;end=shiftDay(`${today.slice(0,7)}-01`,-1);break;
    case 'thisQuarter': start=`${today.slice(0,4)}-${String(Math.floor(date.getUTCMonth()/3)*3+1).padStart(2,'0')}-01`;break;
    case 'thisYear': start=`${today.slice(0,4)}-01-01`;break;
    default: throw new Error('Unknown time-period preset');
  }
  return {start,end};
}
export function calendarDays(month) {
  const first=`${month}-01`, offset=(utc(first).getUTCDay()+6)%7;
  const count=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();
  return Array.from({length:Math.ceil((offset+count)/7)*7},(_,i)=>i<offset||i>=offset+count ? '' : `${month}-${String(i-offset+1).padStart(2,'0')}`);
}
export const displayDate = date => date ? date.split('-').reverse().join('-') : 'Select date';
export function periodBounds(start,end,startTime,endTime) {
  if (![start,end].every(value=>/^\d{4}-\d{2}-\d{2}$/.test(value)) || ![startTime,endTime].every(value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value))) return null;
  if ([start,end].some(value=>!Number.isFinite(utc(value).getTime()) || iso(utc(value))!==value)) return null;
  const from=`${start}T${startTime}:00`,to=`${end}T${endTime}:59.999`;
  return from<=to ? {from,to} : null;
}
export function timeParts(time) {
  const [hour,minute]=time.split(':');
  return {hour:String(Number(hour)%12||12).padStart(2,'0'),minute,period:Number(hour)>=12?'PM':'AM'};
}
export function timeFromParts({hour,minute,period}) {
  return `${String(Number(hour)%12+(period==='PM'?12:0)).padStart(2,'0')}:${minute}`;
}
