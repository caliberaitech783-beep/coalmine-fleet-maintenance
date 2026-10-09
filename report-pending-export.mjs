import {indiaDateTimeEpoch} from './report-date-range.mjs';
import {displaySiteName} from './region-scope.mjs';

export const REMOVED_REPORT_TITLES=new Set(['Open Off road Cases','Recent Breakdown Cases','Report for On Road / Off Road & Idle']);
export function pendingPdfRows(title,rows){
  const timestamp=title==='Maintenance Status Pending'?'acceptedAt':title==='Unverified Cases'?'closedAt':null;
  if(!timestamp)return {rows,summary:null};
  // Earlier timestamps mean longer delay; missing timings stay last.
  const time=row=>{const value=indiaDateTimeEpoch(row[timestamp]);return Number.isFinite(value)?value:Infinity;};
  const sorted=[...rows].sort((a,b)=>time(a)-time(b));
  const counts=new Map();
  for(const row of sorted){const site=displaySiteName(row.reportSite||row.site||row.currentLocation||row.location)||'Not recorded';counts.set(site,(counts.get(site)||0)+1);}
  return {rows:sorted,summary:{title:'Site-wise pending total count',columns:[{label:'Site'},{label:'Pending total count'}],rows:[...counts].sort(([a],[b])=>a.localeCompare(b))}};
}
