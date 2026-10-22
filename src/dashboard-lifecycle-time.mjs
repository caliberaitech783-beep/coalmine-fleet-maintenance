import {parseRequestTimelineTimestamp} from '../request-timeline.mjs';

// A single continuous IST date/time interval, not a repeated daily time slice.
// With no time limits, the caller's existing inclusive date filter is unchanged.
export function lifecycleTimeMatches(record,event,from='',to='',fromDate='',toDate=''){
 if(!from&&!to)return true;
 const valid=value=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
 if((from&&!valid(from))||(to&&!valid(to)))return false;
 const start=parseRequestTimelineTimestamp(`${fromDate}T${from||'00:00'}:00+05:30`);
 const end=parseRequestTimelineTimestamp(`${toDate}T${to||'23:59'}:${to?'00':'59.999'}+05:30`);
 if(!start||!end||end<start)return false;
 const fields={opened:['start','startedAt','createdAt'],closed:['closedAt'],verified:['verifiedAt'],idle:['idealRequestedAt','idleRequestedAt']}[event]||[];
 const date=fields.map(field=>parseRequestTimelineTimestamp(record?.[field])).find(Boolean);
 if(!date)return false;
 return date>=start&&date<=end;
}
