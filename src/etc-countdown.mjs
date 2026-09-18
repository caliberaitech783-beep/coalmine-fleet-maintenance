import {effectiveInfoPulseEtcTimestamp, parseIstTimestamp} from '../ai-feeder.mjs';

const SECOND_MS = 1000;
// The countdown turns amber once the ETC is inside the last hour.
export const ETC_SOON_MS = 60 * 60 * 1000;
// Rows without a usable ETC sort after every real countdown whichever way the column is sorted.
const NO_ETC_SORT_VALUE = Number.MAX_SAFE_INTEGER;

// "1d 3h 59m 20s" for the live cell; "1d 3h 59m" (or "Under 1 min") for exports and filters.
export function formatEtcDuration(milliseconds, {seconds = true} = {}) {
  const total = Math.max(0, Math.floor(Math.abs(Number(milliseconds) || 0) / SECOND_MS));
  if (!seconds && total < 60) return 'Under 1 min';
  const days = Math.floor(total / 86_400), hours = Math.floor(total / 3_600) % 24, minutes = Math.floor(total / 60) % 60, secs = total % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  if (minutes || hours || days || !seconds) parts.push(`${minutes}m`);
  if (seconds) parts.push(`${secs}s`);
  return parts.join(' ');
}

// The ETC instant the request is really working towards: stored IST text with the
// legacy same-day AM/PM inversion repaired, or NaN when nothing readable is stored.
export function etcTimestamp(request = {}) {
  return effectiveInfoPulseEtcTimestamp(request);
}

// What the date formatter should print for the ETC column: the effective instant as
// ISO text, falling back to whatever text is stored so nothing is silently hidden.
export function etcDisplayValue(request = {}) {
  const etc = etcTimestamp(request);
  return Number.isFinite(etc) ? new Date(etc).toISOString() : String(request.expectedCompletionAt || '');
}

// Reverse countdown to the ETC. `label` carries seconds for the live cell, `summary`
// stops at minutes for exports and column filters, and `live` says whether the value
// still changes with the clock (closed, verified and idle requests stand still).
export function etcCountdown(request = {}, now = Date.now()) {
  const stored = String(request.expectedCompletionAt || '').trim();
  const etc = etcTimestamp(request);
  const base = {etc, remainingMs: null, live: false};
  if (!stored) return {...base, state: 'none', label: 'Not set', summary: '—'};
  if (!Number.isFinite(etc)) return {...base, state: 'unknown', label: 'Not readable', summary: '—'};
  const status = String(request.status || '').trim().toLowerCase();
  const closedAt = parseIstTimestamp(request.closedAt);
  const closed = Number.isFinite(closedAt) || ['closed', 'verified'].includes(status) || Boolean(String(request.verifiedAt || '').trim());
  if (closed) {
    if (!Number.isFinite(closedAt)) return {...base, state: 'closed', label: 'Closed', summary: 'Closed'};
    const margin = etc - closedAt;
    if (margin >= 0) return {...base, state: 'closed', remainingMs: margin, label: 'Closed within ETC', summary: 'Closed within ETC'};
    const late = `Closed ${formatEtcDuration(-margin, {seconds: false})} after ETC`;
    return {...base, state: 'closed-late', remainingMs: margin, label: late, summary: late};
  }
  if (['idle', 'ideal'].includes(status)) return {...base, state: 'idle', label: 'Idle', summary: 'Idle'};
  const remainingMs = etc - now;
  if (remainingMs < 0) {
    return {...base, state: 'overdue', remainingMs, live: true, label: `Overdue by ${formatEtcDuration(-remainingMs)}`, summary: `Overdue by ${formatEtcDuration(-remainingMs, {seconds: false})}`};
  }
  const state = remainingMs <= ETC_SOON_MS ? 'soon' : 'due';
  return {...base, state, remainingMs, live: true, label: `${formatEtcDuration(remainingMs)} left`, summary: `${formatEtcDuration(remainingMs, {seconds: false})} left`};
}

// Sort key for the ETC column: earliest deadline first, unset ETCs last.
export function etcSortValue(request = {}) {
  const etc = etcTimestamp(request);
  return Number.isFinite(etc) ? etc : NO_ETC_SORT_VALUE;
}

// Sort key for the time-left column: most overdue first, then the nearest deadlines,
// with closed, idle and unset requests at the end.
export function etcRemainingSortValue(request = {}, now = Date.now()) {
  const countdown = etcCountdown(request, now);
  return countdown.live ? countdown.remainingMs : NO_ETC_SORT_VALUE;
}
