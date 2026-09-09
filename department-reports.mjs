import {indiaDateTimeEpoch} from './report-date-range.mjs';
import {equipmentGroupValue} from './equipment-group.mjs';
import {elapsedLabel} from './report-metrics.mjs';
import {acceptanceTime, maintenanceDelay, pendingRemark, availabilityPercentage} from './report-refinements.mjs';
import {visibleInMisRequests} from './src/mis-history.mjs';
import {IN_OUT_REPORT_COLUMNS, IN_OUT_REPORT_DESCRIPTION, buildInOutReportRows} from './in-out-report.mjs';
import {parseRequestTimelineTimestamp,requestTimelineDurations,formatTimelineDuration,requestTimelineEvents} from './request-timeline.mjs';

export const DEPARTMENT_REPORT_TITLES = ['Turn Around Time for Repair', 'Open Off road Cases', 'Availability Report', '30 Min. Mismatch', 'Unverified Cases', 'Time Taken for MIS Verification', 'Vehicle Transfer Report', 'Total Fleet', 'In and Out', 'Total Request Submitted Report', 'Ticket Acceptance from Maintenance (Timelinewise)', 'Maintenance Status Pending', 'Vehicle Arrival Red Flag Report', 'MIS Red Flag Report', 'Summary Report'];
const clean = value => String(value ?? '').trim();
const status = row => clean(row.status).toLowerCase();
const verified = row => Boolean(row.verifiedAt || row.verifiedBy);
const firstTrip = row => row.firstTripAt || (row.firstTripDate ? `${row.firstTripDate} ${row.firstTripTime || '00:00:00'}` : '');
const col = (key, label, value = row => row[key]) => ({key, label, value});
const duration = (a, b) => Number.isFinite(indiaDateTimeEpoch(a)) && indiaDateTimeEpoch(b) >= indiaDateTimeEpoch(a) ? elapsedLabel(a, b) : 'Not recorded';
const ids = [col('door', 'Door no.', r => r.reportDoor || r.door), col('chassis', 'Chassis No', r => r.chassis || r.chassisNo || r.manufacturerSerialNo)];
const base = [...ids, col('equipmentGroup', 'Equipment group', equipmentGroupValue), col('model', 'Model', r => r.reportModel || r.model), col('complaint', 'Reason/Complaint'), col('category', 'Repair category')];
const site = col('site', 'Location', r => r.reportSite || r.site || r.currentLocation || r.location);
const ref = col('ref', 'Job Reference No');
const closed = col('closedAt', 'Ticket Closed');
const summaryTimingRow = row => ({...row,firstTripAt:row.firstTripAt || (row.firstTripDate && row.firstTripTime ? `${row.firstTripDate} ${row.firstTripTime}` : '')});
const summaryDuration = (row,key) => formatTimelineDuration(requestTimelineDurations(summaryTimingRow(row))[key]);
function summaryClosure(row) {
  const event=requestTimelineEvents(summaryTimingRow(row)).find(event=>event.event==='closedAt');
  const manager=event.label==='Manager on-road closure';
  return `${event.eventAt ? event.label : 'Closure time not recorded'} | ${clean(manager ? row.idealApprovedBy || row.closedBy : row.closedBy) || 'Actor not recorded'}`;
}
function summaryTimingNotes(row) {
  const timing=summaryTimingRow(row);
  const stages=[['start','submission'],['acceptedAt','acceptance'],['closedAt','closure'],['firstTripAt','first trip'],['verifiedAt','verification']];
  const notes=[];
  for(const [key,label] of stages){
    if(!clean(timing[key]))notes.push(`Missing ${label}`);
    else if(!parseRequestTimelineTimestamp(timing[key]))notes.push(`Invalid ${label} timestamp`);
  }
  const known=stages.map(([key,label])=>({label,at:parseRequestTimelineTimestamp(timing[key])?.getTime()})).filter(event=>event.at!=null);
  for(let index=1;index<known.length;index++)if(known[index].at<known[index-1].at)notes.push(`Out of order: ${known[index].label} before ${known[index-1].label}`);
  if(!notes.length)notes.push('In sequence');
  return `${notes.join('; ')}. Event source not supplied.`;
}
function assetReferences(equipment) {
  const references = new Map();
  for (const asset of equipment) for (const value of new Set([asset.chassisNo,asset.manufacturerSerialNo,asset.door,asset.equipmentName,asset.reg].map(value=>clean(value).toLowerCase()).filter(Boolean))) {
    references.set(value,references.has(value) && references.get(value)!==asset ? null : asset);
  }
  return references;
}

// Merge overlapping incidents for each asset before totaling downtime.
export function availabilityRows(equipment, requests, from, to, now = new Date()) {
  const start = indiaDateTimeEpoch(from), end = indiaDateTimeEpoch(to) + (/^\d{4}-\d{2}-\d{2}$/.test(to) ? 86400000 : 0);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const productive = 22 * ((end - start) / 86400000);
  const key = value => clean(value).toLowerCase();
  const references = assetReferences(equipment);
  const intervals = new Map();
  for (const request of requests) {
    const asset = [request.chassis, request.door, request.equipment, request.reg].map(value => references.get(key(value))).find(Boolean);
    if (!asset) continue;
    const opened = indiaDateTimeEpoch(request.start);
    const finished = request.closedAt ? indiaDateTimeEpoch(request.closedAt) : now.getTime();
    const a = Math.max(start, opened), b = Math.min(end, finished, now.getTime());
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) continue;
    const list = intervals.get(asset) || []; list.push([a,b]); intervals.set(asset,list);
  }
  return equipment.map(asset => {
    const list = (intervals.get(asset) || []).sort((a,b) => a[0]-b[0]);
    let hours = 0, previous;
    for (const interval of list) {
      if (previous && interval[0] <= previous[1]) previous[1] = Math.max(previous[1], interval[1]);
      else { if (previous) hours += (previous[1]-previous[0])/3600000; previous = [...interval]; }
    }
    if (previous) hours += (previous[1]-previous[0])/3600000;
    return {...asset, productive, breakdown: hours, available: productive-hours, percentage: (productive-hours)/productive*100};
  });
}

export function buildDepartmentReports({requests = [], equipmentRecords = [], transferRecords = [], from, to, now = new Date()} = {}) {
  const report = (category, title, description, columns, rows, dateValue = r => r.start) => ({category,title,description,columns,rows,dateValue,emptyMessage:'No matching records for this report'});
  const open = requests.filter(r => ['open','in progress','awaiting parts'].includes(status(r)) && !r.closedAt);
  const finished = requests.filter(r => r.closedAt);
  const references = assetReferences(equipmentRecords);
  transferRecords = transferRecords.map(row => {
    const asset = [row.chassisNo,row.manufacturerSerialNo,row.door,row.equipment,row.equipmentName].map(value=>references.get(clean(value).toLowerCase())).find(Boolean);
    return {...row,door:row.door || asset?.door,chassisNo:row.chassisNo || row.manufacturerSerialNo || asset?.chassisNo || asset?.manufacturerSerialNo,model:row.model || row.modelNo || asset?.model};
  });
  return [
    report('maintenance', DEPARTMENT_REPORT_TITLES[0], 'Maintenance acceptance to repair closure. TAT = Repair Closed Date & Time minus Maintenance Acceptance Date & Time.', [...base,col('acceptedAt','Maintenance Acceptance Date & Time',r => acceptanceTime(r) || 'Not accepted'),col('closedAt','Rep. Closed'),col('tat','TAT',r => duration(acceptanceTime(r),r.closedAt)),site,ref], finished, r => r.closedAt),
    report('maintenance', DEPARTMENT_REPORT_TITLES[1], 'Open, in-progress and awaiting-parts off-road requests.', [...base,col('start','Rep. Started'),col('days','BD Days',r => Number.isFinite(indiaDateTimeEpoch(r.start)) ? Math.max(0,(now.getTime()-indiaDateTimeEpoch(r.start))/86400000).toFixed(2) : 'Not recorded'),site,ref],open),
    report('maintenance', DEPARTMENT_REPORT_TITLES[2], '22 productive hours per selected day. Downtime is clipped to the period; overlapping incidents are counted once. Negative availability flags downtime exceeding planned hours.', [...ids,col('equipmentGroup','Equipment group',equipmentGroupValue),col('model','Model'),col('productive','Productive Hrs'),col('breakdown','Breakdown Hrs',r => r.breakdown.toFixed(2)),col('available','Available Hrs',r => r.available.toFixed(2)),col('percentage','Percentage',r => availabilityPercentage(r.percentage))], availabilityRows(equipmentRecords,requests,from,to,now), () => from),
report('mis', DEPARTMENT_REPORT_TITLES[3], 'Difference is first trip minus request closed. Mismatch shows Delay when MIS verification is more than 30 minutes after first trip.', [...base,col('closedAt','Request Closed'),col('firstTrip','First Trip Made',firstTrip),col('difference','Difference',r => duration(r.closedAt,firstTrip(r))),col('mismatch','Mismatch',r => indiaDateTimeEpoch(r.verifiedAt)-indiaDateTimeEpoch(firstTrip(r))>1800000 ? 'Delay' : ''),col('verifiedBy','MIS user'),col('driverName','Driver Name'),site,ref],finished.filter(r => indiaDateTimeEpoch(firstTrip(r))-indiaDateTimeEpoch(r.closedAt)>1800000), firstTrip),
    report('mis', DEPARTMENT_REPORT_TITLES[4], 'Maintenance-closed requests awaiting MIS verification.', [...base,closed,site,ref],requests.filter(r => status(r)==='closed' && !r.verifiedAt).filter(visibleInMisRequests),r => r.closedAt),
    report('mis', DEPARTMENT_REPORT_TITLES[5], 'Elapsed time between ticket closure, actual first trip, and MIS verification.', [...base,closed,col('verifiedAt','MIS verified at'),col('firstTripAt','First trip time',firstTrip),col('difference','Difference',r => duration(r.closedAt,r.verifiedAt)),col('closeToMis','Time taken from ticket close to MIS verification',r => duration(r.closedAt,r.verifiedAt)),col('closeToFirstTrip','Time taken for ticket close to first trip verification',r => duration(r.closedAt,firstTrip(r))),col('firstTripToMis','First trip to MIS verification time taken',r => duration(firstTrip(r),r.verifiedAt)),col('verifiedBy','MIS user'),site,ref],finished.filter(r => r.verifiedAt),r => r.verifiedAt),
    report('mis', DEPARTMENT_REPORT_TITLES[6], 'Transfer history. Chassis number appears once.', [...ids,col('equipment','Equipment / vehicle',r => r.equipment || r.equipmentName),col('model','Model',r => r.model || r.modelNo),col('source','From location'),col('destination','To location'),col('transferNo','Transfer no.'),col('transferDate','Transfer date')],transferRecords,r => r.transferDate),
    report('mis', DEPARTMENT_REPORT_TITLES[7], 'Current equipment and vehicle master records.', [...ids,col('equipmentName','Equipment / vehicle'),col('model','Model'),col('make','Make'),col('itemSpecification','Item specification name'),site],equipmentRecords,() => now.toISOString()),
    report('mis', DEPARTMENT_REPORT_TITLES[8], IN_OUT_REPORT_DESCRIPTION, IN_OUT_REPORT_COLUMNS,buildInOutReportRows(requests,{today:now}),r => r.date),
    report('production', DEPARTMENT_REPORT_TITLES[9], 'Submitted requests across all statuses.', [...base,col('status','Status'),ref,site],requests),
    report('production', DEPARTMENT_REPORT_TITLES[10], 'Production submission to recorded maintenance acceptance.', [...base,col('status','Status'),col('submittedAt','Production Request Submitted Date & Time',r => r.start || r.createdAt),col('acceptedAt','Maintenance Acceptance Date & Time',r => acceptanceTime(r) || 'Not accepted'),col('difference','Difference',r => duration(r.start || r.createdAt,acceptanceTime(r))),col('acceptedBy','Maintenance User Name',r => r.acceptedBy || 'Not recorded'),site,ref],requests),
    report('production', DEPARTMENT_REPORT_TITLES[11], 'All open requests. Delay is measured from maintenance acceptance to the current time.', [...base,col('status','Status'),col('acceptedAt','Maintenance Acceptance Date & Time',r => acceptanceTime(r) || 'Not accepted'),col('delay','Delay',r => maintenanceDelay(r,now)),col('remark','Remarks',r => pendingRemark(r,now)),ref],open),
    report('maintenance', DEPARTMENT_REPORT_TITLES[12], 'Vehicle arrival delays reported by maintenance, including the reason for each red flag.', [
      ref,...base,site,col('status','Request status'),col('start','Production date and time'),
      col('arrivalFlaggedAt','Red flag raised'),col('arrivalFlaggedBy','Flagged by'),
      col('arrivalFlagRemark','Red flag reason',r => clean(r.arrivalFlagRemark) || 'No remark recorded'),
      col('flagWaitingTime','Waiting when flagged',r => duration(r.start,r.acceptedAt && indiaDateTimeEpoch(r.acceptedAt) < indiaDateTimeEpoch(r.arrivalFlaggedAt) ? r.acceptedAt : r.arrivalFlaggedAt)),
      col('acceptedAt','Vehicle received',r => r.acceptedAt || 'Not reached'),
      col('arrivalDelay','Arrival delay',r => duration(r.start,r.acceptedAt || now.toISOString())),
      col('acceptedBy','Received by',r => r.acceptedBy || 'Pending'),
    ],requests.filter(r => r.arrivalFlaggedAt),r => r.arrivalFlaggedAt),
    report('mis', DEPARTMENT_REPORT_TITLES[13], 'Issues raised during MIS verification, with remarks and the latest verification status.', [
      ref,...base,site,col('misFlaggedAt','MIS red flag raised'),col('misFlaggedBy','Flagged by'),
      col('misFlagRemark','MIS remark',r => clean(r.misFlagRemark) || 'No remark recorded'),
      col('verificationStatus','Verification status',r => r.verifiedAt ? 'Verified' : 'Awaiting verification'),
      col('closedAt','Maintenance Closing Time'),col('closedBy','Closed by'),
      col('verifiedAt','MIS verified at'),col('verifiedBy','Verified by'),col('firstTripAt','First trip time',firstTrip),
    ],requests.filter(r => r.misFlaggedAt),r => r.misFlaggedAt),
    report('general', DEPARTMENT_REPORT_TITLES[14], 'MIS-verified requests only. Exact durations: waiting = submission to acceptance; maintenance = acceptance to request closure; return to work = closure to actual first trip. These stages do not overlap; overall = submission to first trip. Repair/closure elapsed and first-trip-to-verification lag are separate measures, not additional stages. For Idle cases, manager on-road approval is request closure, not a separately recorded repair completion; the acceptance-to-closure interval includes the Idle approval wait. Missing or reversed timestamps are not treated as zero. Date filters continue to use production submission.', [
      ...base.slice(0,4),
      ref,
      col('submittedAt','Production submission',r => r.start || 'Not recorded'),
      col('acceptedAt','Maintenance acceptance',r => acceptanceTime(r) || 'Not recorded'),
      col('closedAt','Request closure / on-road approval',r => r.closedAt || 'Not recorded'),
      col('firstTripAt','Actual first trip',r => summaryTimingRow(r).firstTripAt || 'Not recorded'),
      col('verifiedAt','MIS verified at',r => r.verifiedAt || 'Not recorded'),
      col('closureEvent','Closure type / recorded by',summaryClosure),
      ...base.slice(4),site,
      col('waitingTat','Waiting: submission to acceptance',r => summaryDuration(r,'waiting')),
      col('maintenanceTat','Maintenance: acceptance to closure',r => summaryDuration(r,'maintenance')),
      col('returnToWorkTat','Return to work: closure to first trip',r => summaryDuration(r,'returnToWork')),
      col('overallTat','Overall: submission to first trip',r => summaryDuration(r,'overall')),
      col('repairElapsed','Repair / closure elapsed: submission to closure',r => summaryDuration(r,'repairElapsed')),
      col('verificationLag','Verification lag: first trip to verified',r => summaryDuration(r,'verificationLag')),
      col('timingNotes','Timing checks / source',summaryTimingNotes),
    ],requests.filter(r => r.verifiedAt),r => r.start || r.createdAt),
  ];
}
