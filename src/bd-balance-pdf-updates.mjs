import {dailyUpdatesExportRows,dailyUpdatesExportRowsFromText} from './daily-updates-order.mjs';
import {parseRequestTimelineTimestamp} from '../request-timeline.mjs';

export const isBdBalanceReport=title=>/\bbd\s+balance\b/i.test(String(title||''));
const dailyColumn=column=>column?.key==='dailyRemarks'||/daily\s+(?:updates?|remarks?)/i.test(String(column?.label||''));
function updateTime(value){
 const parsed=parseRequestTimelineTimestamp(value);
 if(parsed)return parsed.getTime();
 const match=String(value||'').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)\s+(\d{2})-(\d{2})-(\d{4}|\d{2})$/i);
 if(!match)return null;
 const [,hour,minute,second='00',period,day,month,year]=match;
 const h=Number(hour);if(h<1||h>12)return null;
 return parseRequestTimelineTimestamp(`${year.length===2?'20'+year:year}-${month}-${day}T${String(h%12+(period.toUpperCase()==='PM'?12:0)).padStart(2,'0')}:${minute}:${second}+05:30`)?.getTime()??null;
}
function latestUpdate(updates,timeKey){
 return updates.reduce((latest,item,index)=>{
  const stamp=updateTime(item[timeKey]);
  const rank=Number(item.number)||index;
  if(!latest||(stamp!==null&&(latest.stamp===null||stamp>latest.stamp))||(stamp===latest.stamp&&rank>=latest.rank))return {item,stamp,rank};
  return latest;
 },null)?.item;
}
export function latestBdBalanceUpdateText(row,value){
 const request=row?.requestDetails&&typeof row.requestDetails==='object'?row.requestDetails:row;
 const saved=(Array.isArray(request?.dailyRemarks)?request.dailyRemarks:[]).filter(Boolean);
 const latest=saved.length?dailyUpdatesExportRows([latestUpdate(saved,'createdAt')],{category:request?.repairCategory||request?.category})[0]:latestUpdate(dailyUpdatesExportRowsFromText(value),'dateTime');
 if(!latest)return '—';
 return [`Latest ${latest.dateTime}`,`By: ${latest.author}`,`Update: ${latest.update}`,`Delayed reason: ${latest.delayedReason}`].join('\n');
}
// Only BD Balance PDF downloads opt into this projection. Rows and history are never mutated.
export function bdBalancePdfColumns(columns=[]){
 return columns.map(column=>dailyColumn(column)?{...column,value:row=>latestBdBalanceUpdateText(row,column.value?.(row))}:column);
}
