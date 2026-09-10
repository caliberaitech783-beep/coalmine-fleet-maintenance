import {parseIstTimestamp} from '../ai-feeder.mjs';

export function pulseElapsed(from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 'Not recorded';
  const minutes = Math.floor((to - from) / 60_000);
  if (!minutes) return 'Under 1 min';
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes / 60) % 24;
  return [days ? `${days}d` : '', hours || days ? `${hours}h` : '', `${minutes % 60}m`].filter(Boolean).join(' ');
}

export function pulseCaseTiming(row, now) {
  const request = row.request || {};
  const start = parseIstTimestamp(request.start), closed = parseIstTimestamp(request.closedAt), etc = parseIstTimestamp(request.expectedCompletionAt);
  const status = String(request.status || '').trim().toLowerCase();
  const idle = ['idle', 'ideal'].includes(status);
  const ended = !idle && (Boolean(request.closedAt) || ['closed', 'verified'].includes(status) || Boolean(request.verifiedAt));
  const fields = [
    {label: ended ? 'Breakdown started' : 'Standing since', date: request.start},
    {label: ended ? 'Breakdown duration' : idle ? 'Standing for' : 'Down for', value: pulseElapsed(start, ended ? closed : now), tone: ended ? '' : 'standing'},
  ];
  if (request.expectedCompletionAt) fields.push({label: 'ETC', date: request.expectedCompletionAt});
  if (request.closedAt) fields.push({label: idle ? 'Idle since' : 'Repair closed', date: request.closedAt});
  if (idle && Number.isFinite(closed)) fields.push({label: 'Idle for', value: pulseElapsed(closed, now), tone: 'warning'});
  const types = new Set((row.issues || []).map(issue => issue.type));
  if (!ended && !idle && types.has('etc-overdue')) fields.push({label: 'ETC overdue by', value: pulseElapsed(etc, now), tone: 'critical'});
  if (!ended && !idle && types.has('etc-due-soon')) fields.push({label: 'ETC due in', value: pulseElapsed(now, etc), tone: 'warning'});
  if (types.has('awaiting-verification')) fields.push({label: 'Waiting for MIS', value: pulseElapsed(closed, now), tone: 'warning'});
  return fields;
}
