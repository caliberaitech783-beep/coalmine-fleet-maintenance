import {effectiveInfoPulseEtcTimestamp, parseIstTimestamp} from '../ai-feeder.mjs';

export function pulseElapsed(from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 'Not recorded';
  const minutes = Math.floor((to - from) / 60_000);
  if (!minutes) return 'Under 1 min';
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes / 60) % 24;
  return [days ? `${days}d` : '', hours || days ? `${hours}h` : '', `${minutes % 60}m`].filter(Boolean).join(' ');
}

// Annotates ranked breakdown rows (already longest standing first) with the
// figures the Info Pulse list shows: rank, standing time, its share of the
// longest standing time, and whether the ETC is overdue, still due or unset.
export function pulseBreakdownRows(breakdowns = [], now = Date.now()) {
  const rows = breakdowns.map((row, index) => {
    const request = row.request || {};
    const startedAt = parseIstTimestamp(request.start);
    const standingMs = Number.isFinite(startedAt) && now >= startedAt ? now - startedAt : 0;
    const etc = effectiveInfoPulseEtcTimestamp(request);
    const etcState = !String(request.expectedCompletionAt || '').trim() ? 'none' : !Number.isFinite(etc) ? 'unknown' : etc < now ? 'overdue' : 'due';
    return {...row, rank: index + 1, startedAt, standingMs, etc, etcState};
  });
  const longest = Math.max(0, ...rows.map(row => row.standingMs));
  return rows.map(row => ({...row, share: longest ? Math.max(0.03, row.standingMs / longest) : 0}));
}

export function pulseCaseTiming(row, now) {
  const request = row.request || {};
  const start = parseIstTimestamp(request.start), closed = parseIstTimestamp(request.closedAt), etc = effectiveInfoPulseEtcTimestamp(request);
  const status = String(request.status || '').trim().toLowerCase();
  const idle = ['idle', 'ideal'].includes(status);
  const ended = !idle && (Boolean(request.closedAt) || ['closed', 'verified'].includes(status) || Boolean(request.verifiedAt));
  const fields = [
    {label: ended ? 'Breakdown started' : 'Standing since', date: request.start},
    {label: ended ? 'Breakdown duration' : idle ? 'Standing for' : 'Down for', value: pulseElapsed(start, ended ? closed : now), tone: ended ? '' : 'standing'},
  ];
  if (request.expectedCompletionAt) fields.push({label: 'ETC', date: Number.isFinite(etc) ? new Date(etc).toISOString() : request.expectedCompletionAt});
  if (request.closedAt) fields.push({label: idle ? 'Idle since' : 'Repair closed', date: request.closedAt});
  if (idle && Number.isFinite(closed)) fields.push({label: 'Idle for', value: pulseElapsed(closed, now), tone: 'warning'});
  const types = new Set((row.issues || []).map(issue => issue.type));
  if (!ended && !idle && types.has('etc-overdue')) fields.push({label: 'ETC overdue by', value: pulseElapsed(etc, now), tone: 'critical'});
  if (!ended && !idle && types.has('etc-due-soon')) fields.push({label: 'ETC due in', value: pulseElapsed(now, etc), tone: 'warning'});
  if (types.has('awaiting-verification')) fields.push({label: 'Waiting for MIS', value: pulseElapsed(closed, now), tone: 'warning'});
  return fields;
}
