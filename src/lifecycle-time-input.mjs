import {parseTwelveHourTime} from '../date-time-format.mjs';

export function lifecycleClockValue(clock,period){
 const text=String(clock||'').trim();
 if(!text)return '';
 if(!['AM','PM'].includes(period))return null;
 const normalized=/^\d{1,2}$/.test(text)?`${text}:00`:text;
 return parseTwelveHourTime(`${normalized} ${period}`)||null;
}
