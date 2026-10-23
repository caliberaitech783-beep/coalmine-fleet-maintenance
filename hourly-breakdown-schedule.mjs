import {normalizeShiftRecord} from './shift-master.mjs';
import {canonicalSiteName} from './site-location.mjs';
import {displaySiteName} from './region-scope.mjs';

// Preferences only: delivery is deliberately not connected to a sender yet.
export function normalizeHourlyBreakdownSchedule(value={}) {
  const cutoff=/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.cutoffTime||'')&&value.cutoffTime<='23:00'?value.cutoffTime:'23:00';
  return {selected:value.selected===true,intervalHours:2,cutoffTime:cutoff,
    weekdays:Array.isArray(value.weekdays)?[...new Set(value.weekdays.filter(day=>Number.isInteger(day)&&day>=0&&day<=6))].sort():[0,1,2,3,4,5,6],
    windowMode:'two-hour',deliveryEnabled:false};
}

export function hourlyBreakdownSiteSchedules(sites=[],shifts=[],{date=new Date().toISOString().slice(0,10),cutoffTime='23:00'}={}) {
  const stop=normalizeHourlyBreakdownSchedule({cutoffTime}).cutoffTime;
  const normalized=shifts.flatMap(row=>{try{return [normalizeShiftRecord(row)];}catch{return [];}});
  const unique=[...new Map(sites.map(site=>[canonicalSiteName(site),displaySiteName(site)])).entries()];
  return unique.filter(([key])=>key&&key!==canonicalSiteName('Lalpeth OC')).map(([key,site])=>{
    const matches=normalized.filter(shift=>canonicalSiteName(shift.site)===key&&shift.status==='Active'
      &&['A','1'].includes(shift.shiftCode)&&(!shift.effectiveFrom||shift.effectiveFrom<=date)&&(!shift.effectiveTo||shift.effectiveTo>=date));
    if(matches.length!==1)return {site,startTime:null,times:[],windows:[],warning:matches.length?'Multiple active A / Shift 1 records; resolve the overlap.':'A shift / Shift 1 is not configured.'};
    const shift=matches[0],seconds=time=>{const [h,m,s=0]=time.split(':').map(Number);return h*3600+m*60+s;};
    const begin=seconds(shift.startTime),finish=seconds(`${stop}:00`),format=value=>[Math.floor(value/3600),Math.floor(value%3600/60),value%60].map(v=>String(v).padStart(2,'0')).join(':');
    const windows=[];
    for(let end=begin+7200;end<=finish;end+=7200)windows.push({start:format(end-7200),end:format(end)});
    return {site,startTime:shift.startTime,times:windows.map(window=>window.end),windows,warning:windows.length?'':'No complete two-hour window before the cutoff.'};
  });
}
