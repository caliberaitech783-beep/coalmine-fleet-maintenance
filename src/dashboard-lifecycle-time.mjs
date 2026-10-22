import {parseRequestTimelineTimestamp} from '../request-timeline.mjs';

// Applies the selected daily time window in IST on every selected date.
// Blank limits preserve the existing whole-day report, including legacy rows.
export function lifecycleTimeMatches(record,event,from='',to=''){
 if(!from&&!to)return true;
 const valid=value=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
 if((from&&!valid(from))||(to&&!valid(to)))return false;
 const fields={opened:['start','startedAt','createdAt'],closed:['closedAt'],verified:['verifiedAt'],idle:['idealRequestedAt','idleRequestedAt']}[event]||[];
 const date=fields.map(field=>parseRequestTimelineTimestamp(record?.[field])).find(Boolean);
 if(!date)return false;
 const time=new Date(date.getTime()+330*60000).toISOString().slice(11,16);
 return from&&to&&from>to ? time>=from||time<=to : (!from||time>=from)&&(!to||time<=to);
}
