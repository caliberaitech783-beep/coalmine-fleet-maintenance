import {requestEventDate} from './dashboard-request-data.mjs';
import {isIdleVehicleRequest} from '../request-idle.mjs';

// One selection powers both the badge and its drilldown. On-road completion
// (including a subsequent idle period) removes the request from today's list.
export function activeTodayBreakdowns(records = [], day = '') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  return records.filter(record => {
    const status = String(record.status || '').trim().toLowerCase();
    return requestEventDate(record, 'opened') === day
      && !['closed', 'verified', 'on road', 'on-road', 'onroad', 'completed'].includes(status)
      && !isIdleVehicleRequest(record)
      && !record.closedAt && !record.verifiedAt;
  });
}
