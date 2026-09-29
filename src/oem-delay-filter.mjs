import {pulseDelayReason} from './info-pulse-reasons.mjs';
import {requestStatusLabel} from './request-status.mjs';

export function filterOemDelayedRows(rows = [], historical = false) {
  return rows.map(row => ({...row, requests: row.requests.filter(request =>
    (historical || !['closed', 'verified', 'idle', 'ideal'].includes(requestStatusLabel(request).toLowerCase()))
    && /\boem\b/i.test(pulseDelayReason(request)?.value || '')
  )})).filter(row => row.requests.length);
}
