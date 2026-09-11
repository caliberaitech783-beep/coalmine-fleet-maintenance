import {requestStatusLabel} from './src/request-status.mjs';
import {indiaDateTimeEpoch} from './report-date-range.mjs';
import {equipmentGroupValue} from './equipment-group.mjs';
import {elapsedLabel} from './report-metrics.mjs';
import {acceptanceTime, maintenanceDelay, pendingRemark, availabilityPercentage} from './report-refinements.mjs';
import {visibleInMisRequests} from './src/mis-history.mjs';
import {MIS_IN_OUT_REPORT_COLUMNS, MIS_IN_OUT_REPORT_DESCRIPTION, buildSiteInOutReportRows} from './in-out-report.mjs';
import {requestTimelineDurations,formatTimelineDuration,requestTimelineEvents} from './request-timeline.mjs';

const REPORT_TITLES = ['Turn Around Time for Repair', 'Open Off road Cases', 'Availability Report', '30 Min. Mismatch', 'Unverified Cases', 'MIS Turn Around Time', 'Vehicle Transfer Report', 'Total Fleet', 'Total In and out count report', 'Total Request Submitted Report', 'Ticket Acceptance from Maintenance (Timelinewise)', 'Maintenance Status Pending', 'Vehicle Arrival Red Flag Report', 'MIS Red Flag Report', 'Summary Report'];
export const DEPARTMENT_REPORT_TITLES = REPORT_TITLES.filter((_,index) => index !== 6);
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
const productionLead = [col('status', 'Status', requestStatusLabel), site, ids[0]];
const complaintColumns = base.slice(4);
const maintenanceLead = [site, ids[0], base[2], base[3], base[5]];
const closed = col('closedAt', 'Ticket Closed');
// Time since ticket closure: hours and minutes under a day, days and hours once 24 hours have passed.
function closedDelay(closedAt, now) {
  const elapsed = now.getTime() - indiaDateTimeEpoch(closedAt);
  if (!Number.isFinite(elapsed)) return 'Not recorded';
  const minutes = Math.floor(Math.max(0,elapsed) / 60000), hours = Math.floor(minutes / 60);
  return hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h ${minutes % 60}m`;
}
function breakdownDaysHours(start, now) {
  const elapsed = now.getTime() - indiaDateTimeEpoch(start);
  if (!Number.isFinite(elapsed)) return 'Not recorded';
  const hours = Math.floor(Math.max(0,elapsed) / 3600000);
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
const summaryTimingRow = row => ({...row,firstTripAt:row.firstTripAt || (row.firstTripDate && row.firstTripTime ? `${row.firstTripDate} ${row.firstTripTime}` : '')});
const summaryDuration = (row,key) => formatTimelineDuration(requestTimelineDurations(summaryTimingRow(row))[key]);
function summaryClosure(row) {
  const event=requestTimelineEvents(summaryTimingRow(row)).find(event=>event.event==='closedAt');
  const manager=event.label==='Manager on-road closure';
  return `${event.eventAt ? event.label : 'Closure time not recorded'} | ${clean(manager ? row.idealApprovedBy || row.closedBy : row.closedBy) || 'Actor not recorded'}`;
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
  // A full selected day contributes 24 hours; date-time ranges retain partial days.
  const productive = 24 * ((end - start) / 86400000);
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
  return [
    // Maintenance reports lead with Location and Door no.; chassis closes the row.
    report('maintenance', REPORT_TITLES[0], 'Maintenance acceptance to repair closure. TAT = Repair Closed Date & Time minus Maintenance Acceptance Date & Time.', [...maintenanceLead,col('acceptedAt','Maintenance Acceptance Date & Time',r => acceptanceTime(r) || 'Not accepted'),col('closedAt','Rep. Closed'),col('tat','TAT',r => duration(acceptanceTime(r),r.closedAt)),base[4],ref,ids[1]], finished, r => r.closedAt),
    report('maintenance', REPORT_TITLES[1], 'Open, in-progress and awaiting-parts off-road requests. BD duration shows completed days and hours since production submission.', [...maintenanceLead,col('start','Rep. Started'),col('days','BD Days / Hrs',r => breakdownDaysHours(r.start,now)),base[4],ref,ids[1]],open),
    report('maintenance', REPORT_TITLES[2], '24 productive hours per selected day. Partial days use the selected hours. Downtime is clipped to the period; overlapping incidents are counted once.', [site,ids[0],col('equipmentGroup','Equipment group',equipmentGroupValue),col('model','Model'),col('productive','Productive Hrs'),col('breakdown','Breakdown Hrs',r => r.breakdown.toFixed(2)),col('available','Available Hrs',r => r.available.toFixed(2)),col('percentage','Percentage',r => availabilityPercentage(r.percentage)),ids[1]], availabilityRows(equipmentRecords,requests,from,to,now), () => from),
report('mis', REPORT_TITLES[3], 'TAT is first trip minus request closed. Mismatch shows Delay when MIS verification is more than 30 minutes after first trip.', [...maintenanceLead,col('closedAt','Request Closed'),col('firstTrip','First Trip Made',firstTrip),col('difference','TAT',r => duration(r.closedAt,firstTrip(r))),col('mismatch','Mismatch',r => indiaDateTimeEpoch(r.verifiedAt)-indiaDateTimeEpoch(firstTrip(r))>1800000 ? 'Delay' : ''),base[4],col('driverName','Driver Name'),ref,ids[1],col('verifiedBy','MIS user')],finished.filter(r => indiaDateTimeEpoch(firstTrip(r))-indiaDateTimeEpoch(r.closedAt)>1800000), firstTrip),
    report('mis', REPORT_TITLES[4], 'Maintenance-closed requests awaiting MIS verification. Delay is the time since ticket closure.', [...maintenanceLead,closed,col('delay','Delay',r => closedDelay(r.closedAt,now)),base[4],ref,ids[1]],requests.filter(r => status(r)==='closed' && !r.verifiedAt).filter(visibleInMisRequests),r => r.closedAt),
    report('mis', REPORT_TITLES[5], 'Elapsed time between ticket closure, actual first trip, and MIS verification.', [...maintenanceLead,closed,col('verifiedAt','MIS verified at'),col('firstTripAt','First trip time',firstTrip),{...col('closeToMis','Time taken from ticket close to MIS verification',r => duration(r.closedAt,r.verifiedAt)),wrapHeader:true},{...col('closeToFirstTrip','Time taken for ticket close to first trip verification',r => duration(r.closedAt,firstTrip(r))),wrapHeader:true},{...col('firstTripToMis','First trip to MIS verification time taken',r => duration(firstTrip(r),r.verifiedAt)),wrapHeader:true},base[4],col('verifiedBy','MIS user'),ref,ids[1]],finished.filter(r => r.verifiedAt),r => r.verifiedAt),
    report('mis', REPORT_TITLES[7], 'Current equipment and vehicle master records.', [site,ids[0],col('equipmentName','Equipment / vehicle'),col('model','Model'),col('make','Make'),col('itemSpecification','Item specification name'),ids[1]],equipmentRecords,() => now.toISOString()),
    report('mis', REPORT_TITLES[8], MIS_IN_OUT_REPORT_DESCRIPTION, MIS_IN_OUT_REPORT_COLUMNS,buildSiteInOutReportRows(requests,{today:now}),r => r.date),
    // Production reports lead with Status, Location and Door no.; chassis is omitted.
    report('production', REPORT_TITLES[9], 'Submitted requests across all statuses.', [...productionLead,...base.slice(2,4),...complaintColumns,ref],requests),
    report('production', REPORT_TITLES[10], 'Production submission to recorded maintenance acceptance.', [...productionLead,...base.slice(2,4),col('submittedAt','Production Request Submitted Date & Time',r => r.start || r.createdAt),col('acceptedAt','Maintenance Acceptance Date & Time',r => acceptanceTime(r) || 'Not accepted'),col('difference','Difference',r => duration(r.start || r.createdAt,acceptanceTime(r))),col('acceptedBy','Maintenance User Name',r => r.acceptedBy || 'Not recorded'),ref,...complaintColumns],requests),
    report('production', REPORT_TITLES[11], 'All open requests. Delay is measured from maintenance acceptance to the current time.', [...productionLead,...base.slice(2,4),col('acceptedAt','Maintenance Acceptance Date & Time',r => acceptanceTime(r) || 'Not accepted'),col('delay','Delay',r => maintenanceDelay(r,now)),col('remark','Remarks',r => pendingRemark(r,now)),...complaintColumns,ref],open),
    report('maintenance', REPORT_TITLES[12], 'Vehicle arrival delays reported by maintenance, including the reason for each red flag.', [
      col('status','Request status',requestStatusLabel),...maintenanceLead,col('start','Production date and time'),
      col('arrivalFlaggedAt','Red flag raised'),
      {...col('arrivalFlagRemark','Red flag reason',r => clean(r.arrivalFlagRemark) || 'No remark recorded'),wrap:true},
      col('flagWaitingTime','Waiting when flagged',r => duration(r.start,r.acceptedAt && indiaDateTimeEpoch(r.acceptedAt) < indiaDateTimeEpoch(r.arrivalFlaggedAt) ? r.acceptedAt : r.arrivalFlaggedAt)),
      ids[1],col('arrivalFlaggedBy','Flagged by'),ref,
    ],requests.filter(r => r.arrivalFlaggedAt),r => r.arrivalFlaggedAt),
    report('mis', REPORT_TITLES[13], 'Issues raised during MIS verification, with remarks and maintenance closure details.', [
      ...maintenanceLead,ref,col('misFlaggedAt','MIS red flag raised'),col('misFlaggedBy','Flagged by'),
      col('misFlagRemark','MIS remark',r => clean(r.misFlagRemark) || 'No remark recorded'),
      col('closedAt','Maintenance Closing Time'),col('closedBy','Closed by'),
      ids[1],
    ],requests.filter(r => r.misFlaggedAt),r => r.misFlaggedAt),
    report('general', REPORT_TITLES[14], 'MIS-verified requests only. Exact durations: waiting = submission to acceptance; maintenance = acceptance to request closure; return to work = closure to actual first trip. These stages do not overlap; overall = submission to first trip. Repair/closure elapsed and first-trip-to-verification lag are separate measures, not additional stages. For Idle cases, manager on-road approval is request closure, not a separately recorded repair completion; the acceptance-to-closure interval includes the Idle approval wait. Missing or reversed timestamps are not treated as zero. Date filters continue to use production submission.', [
      // Location leads, then asset identifiers; job reference and closure type close the row in both the report and its exports.
      site,
      ...base.slice(0,4).filter(column => column.key !== 'chassis'),
      col('submittedAt','Production submission',r => r.start || 'Not recorded'),
      col('acceptedAt','Maintenance acceptance',r => acceptanceTime(r) || 'Not recorded'),
      col('closedAt','Request closure / on-road approval',r => r.closedAt || 'Not recorded'),
      col('firstTripAt','Actual first trip',r => summaryTimingRow(r).firstTripAt || 'Not recorded'),
      col('verifiedAt','MIS verified at',r => r.verifiedAt || 'Not recorded'),
      ...base.slice(4),
      col('waitingTat','Waiting: submission to acceptance',r => summaryDuration(r,'waiting')),
      col('maintenanceTat','Maintenance: acceptance to closure',r => summaryDuration(r,'maintenance')),
      col('returnToWorkTat','Return to work: closure to first trip',r => summaryDuration(r,'returnToWork')),
      col('overallTat','Overall: submission to first trip',r => summaryDuration(r,'overall')),
      col('repairElapsed','Repair / closure elapsed: submission to closure',r => summaryDuration(r,'repairElapsed')),
      col('verificationLag','Verification lag: first trip to verified',r => summaryDuration(r,'verificationLag')),
      ref,
      col('closureEvent','Closure type / recorded by',summaryClosure),
    ],requests.filter(r => r.verifiedAt),r => r.start || r.createdAt),
  ];
}
