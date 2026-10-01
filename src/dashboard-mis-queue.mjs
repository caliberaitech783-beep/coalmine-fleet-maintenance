import { visibleInMisRequests } from './mis-history.mjs';
import { requestEventDate } from './dashboard-request-data.mjs';

// Legacy closed requests may lack a closing timestamp. Keep them visible using
// their recorded opening day, rather than silently losing pending MIS work.
export function misQueueDate(record) {
  return requestEventDate(record, 'closed') || requestEventDate(record, 'opened');
}

// Pass the authenticated feed, not the dashboard's historical exclusions.
// The caller retains all permission, location and shift restrictions.
export function dashboardMisQueue(rows, { from = '', to = '', inScope = () => true } = {}) {
  return rows.filter(record => {
    if (!visibleInMisRequests(record) || !inScope(record)) return false;
    const day = misQueueDate(record);
    return (!from || day >= from) && (!to || day <= to);
  });
}
