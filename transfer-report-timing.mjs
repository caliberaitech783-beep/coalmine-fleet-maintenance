import {indiaDateTimeEpoch} from './report-date-range.mjs';
import {formatDisplayDateTime} from './date-time-format.mjs';
import {elapsedLabel} from './report-metrics.mjs';

export const transferReportTimingColumns=[
  {key:'transferTime',label:'Transfer time',value:row=>row.submittedAt?formatDisplayDateTime(row.submittedAt):'Not recorded'},
  {key:'transferAcceptedAt',label:'Transfer accepted date and time',value:row=>row.destinationAcceptedAt?formatDisplayDateTime(row.destinationAcceptedAt):'Not recorded'},
  {key:'transferTat',label:'TAT',value:row=>{
    if(!row.destinationAcceptedAt)return 'Pending';
    const start=indiaDateTimeEpoch(row.submittedAt),end=indiaDateTimeEpoch(row.destinationAcceptedAt);
    return Number.isFinite(start)&&Number.isFinite(end)&&end>=start?elapsedLabel(row.submittedAt,row.destinationAcceptedAt):'Not recorded';
  }},
];
