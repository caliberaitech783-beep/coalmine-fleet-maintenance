import {parseReportTimestamp} from './report-metrics.mjs';
import {canonicalSiteName} from './site-location.mjs';
import {displaySiteName} from './region-scope.mjs';
import {formatDisplayDateTime} from './date-time-format.mjs';
import {buildDirectorReportTables} from './director-report-bundle.mjs';
import {availabilityRows} from './department-reports.mjs';
import {breakdownMeterValue} from './breakdown-meter-columns.mjs';

const clean=value=>String(value??'').trim();
export const REQUEST_REPORT_EVENTS=[
  ['createdAt','Request recorded'],['start','Opened / Off Road'],['acceptedAt','Maintenance accepted'],['inProgressAt','Maintenance in progress'],
  ['closedAt','Closed / On Road'],['verifiedAt','MIS verified'],
  ['idealRequestedAt','Marked Idle'],['idealApprovedAt','Idle approved On Road'],
  ['firstTripAt','First trip verified'],['arrivalFlaggedAt','Arrival flagged'],['misFlaggedAt','MIS flagged'],
];
export function timestampInReportWindow(value,window){
  const date=parseReportTimestamp(value);
  return Boolean(date&&date>=window.start&&date<window.end);
}
export function requestActivityInWindow(request,window){
  const events=REQUEST_REPORT_EVENTS.filter(([key])=>timestampInReportWindow(request[key],window))
    .map(([key,label])=>({label,at:parseReportTimestamp(request[key])}));
  for(const remark of request.dailyRemarks||[]){
    if(timestampInReportWindow(remark.createdAt,window))events.push({label:'Maintenance update',at:parseReportTimestamp(remark.createdAt)});
  }
  return events.sort((left,right)=>left.at-right.at);
}

// Use [start,end): a case at exactly the next slot belongs to the next report.
// Include every case that had activity, even if it opened and closed in one slot.
export function requestsInReportWindow(requests=[],window){
  if(!window?.start||!window?.end)throw new Error('A scheduled report requires a start and end time.');
  return requests.filter(request=>requestActivityInWindow(request,window).length);
}
function requestBeforeEnd(request,end){
  const next={...request,dailyRemarks:(request.dailyRemarks||[]).filter(remark=>{
    const date=parseReportTimestamp(remark.createdAt);return date&&date<end;
  })};
  for(const [key] of REQUEST_REPORT_EVENTS){const date=parseReportTimestamp(next[key]);if(date&&date>=end)next[key]='';}
  if(!next.verifiedAt){next.verifiedBy='';next.verificationStatus='';}
  if(!next.firstTripAt)next.firstTripDone=false;
  if(!next.idealRequestedAt){next.idleReason='';next.idealRequestedBy='';}
  if(!next.idealApprovedAt)next.idealApprovedBy='';
  if(!next.closedAt){
    next.closedBy='';
    // Closing meter readings are recorded at closure, so a case still open at window end has none yet.
    next.closingMeterReadings={};next.closingMeterReading='';
    if(parseReportTimestamp(request.closedAt)>=end){next.maintenanceWork='';next.delayedReason='';}
    next.status=next.idealRequestedAt&&!next.idealApprovedAt?'Idle':next.inProgressAt?'In progress':next.acceptedAt?'Accepted':'Open';
  }
  return next;
}
const dateLabel=value=>value?formatDisplayDateTime(value):'';
export const FLEET_ACTIVITY_COLUMNS=[
  'Request reference','Equipment / door','Site','Activity in this window','Status at window end',
  'Opened at (IST)','Closed at (IST)','MIS verified at (IST)','Idle since (IST)',
  'Complaint','Opening HMR','Opening KMR','Closing HMR','Closing KMR','Maintenance work / updates','Idle / delay reason','Reported by',
].map(label=>({label}));

export function fleetActivityTable(requests,window){
  const cases=requestsInReportWindow(requests,window);
  return {title:'All request activity in this window',columns:FLEET_ACTIVITY_COLUMNS,rows:cases.map(request=>{
    const snapshot=requestBeforeEnd(request,window.end);
    return [request.ref||request.reference,[request.equipmentGroup||request.equipment,request.door].filter(Boolean).join(' / '),displaySiteName(request.site),
      requestActivityInWindow(request,window).map(event=>`${event.label}: ${dateLabel(event.at)}`).join('\n'),
      snapshot.verifiedAt?'MIS verified':snapshot.status,
      dateLabel(snapshot.start),dateLabel(snapshot.closedAt),dateLabel(snapshot.verifiedAt),dateLabel(snapshot.idealRequestedAt),
      request.complaint||'',
      breakdownMeterValue(snapshot,'HMR'),breakdownMeterValue(snapshot,'KMR'),breakdownMeterValue(snapshot,'HMR','closing'),breakdownMeterValue(snapshot,'KMR','closing'),
      [snapshot.maintenanceWork,...snapshot.dailyRemarks.filter(remark=>timestampInReportWindow(remark.createdAt,window)).map(remark=>`${dateLabel(remark.createdAt)}: ${remark.remark||''}`)].filter(Boolean).join('\n'),
      [snapshot.idleReason,snapshot.delayedReason,...snapshot.dailyRemarks.filter(remark=>timestampInReportWindow(remark.createdAt,window)).map(remark=>remark.delayReason)].filter(Boolean).join('; '),
      request.owner||request.requesterLogin||'',
    ];
  })};
}
export function siteSourceData(source,site){
  const wanted=canonicalSiteName(site),matches=value=>canonicalSiteName(value)===wanted;
  return {
    requests:(source.requests||[]).filter(row=>matches(row.site||row.reportSite)),
    equipmentRecords:(source.equipmentRecords||[]).filter(row=>matches(row.currentLocation||row.location||row.site)),
    transferRecords:(source.transferRecords||[]).filter(row=>matches(row.destination||row.currentLocation||row.location||row.source)),
  };
}
export function reportSites(source,scope={sites:null}){
  const available=[...(source.requests||[]).map(row=>row.site||row.reportSite),
    ...(source.equipmentRecords||[]).map(row=>row.currentLocation||row.location||row.site),
    ...(source.transferRecords||[]).map(row=>row.destination||row.currentLocation||row.location||row.source)];
  const sites=scope.sites===null?available:scope.sites||[];
  return [...new Set(sites.map(canonicalSiteName).filter(Boolean))].sort((a,b)=>displaySiteName(a).localeCompare(displaySiteName(b)));
}
function transferInWindow(row,window){
  const value=row.transferDate||row.transferredAt||row.date;
  const at=/^\d{4}-\d{2}-\d{2}$/.test(clean(value))?`${value} 00:00:00`:value;
  return timestampInReportWindow(at,window);
}
export function buildSiteFleetReportTables({source,site,window,reportTitles=[]}){
  const scoped=siteSourceData(source,site);
  const activity=fleetActivityTable(scoped.requests,window);
  const requests=requestsInReportWindow(scoped.requests,window).map(request=>requestBeforeEnd(request,window.end));
  const selected=new Set(reportTitles);
  const tables=buildDirectorReportTables({requests,equipmentRecords:scoped.equipmentRecords,
    transferRecords:scoped.transferRecords.filter(row=>transferInWindow(row,window)),now:window.end})
    .filter(table=>selected.has(table.title)&&table.rows.length)
    .map(table=>table.title==='Availability Report'?{
      ...table,
      // Availability measures the whole interval, including incidents already
      // open at its start. Activity-only rows would falsely show those assets as
      // available; the legacy month-to-date denominator is also inappropriate.
      rows:availabilityRows(scoped.equipmentRecords,scoped.requests,window.start,window.end,window.end)
        .map(row=>table.columns.map(column=>column.value?column.value(row):row[column.key])),
    }:table);
  // Complete activity stays first, so status-specific views cannot hide a case
  // that changed status more than once between two scheduled deliveries.
  return [activity,...tables];
}
export function siteReportFilename(kind,site,slotKey,extension){
  const part=value=>clean(value).replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,90)||'site';
  return `Nerve-Center-${part(kind)}-${part(displaySiteName(site))}-${part(slotKey)}.${extension}`;
}
export function buildSiteReportMessage({kind='Fleet',site,window,count,pdfUrl,xlsxUrl}){
  if(!pdfUrl||!xlsxUrl)throw new Error('A site report requires both PDF and Excel links.');
  const siteLabel=displaySiteName(site)||'Not assigned';
  return [`*SITE: ${siteLabel}*`, `*Nerve Center | ${kind} consolidated report*`,
    `*FROM:* ${dateLabel(window.start)}`,`*TO:* ${dateLabel(window.end)} IST`,
    `*${kind==='CRM'?'Tickets':'Cases'} with activity:* ${count}`,
    `*PDF - ${siteLabel}:* ${pdfUrl}`,`*Excel - ${siteLabel}:* ${xlsxUrl}`,
  ].join('\n');
}
