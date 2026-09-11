import {requestDateKey} from './dashboard-request-data.mjs';
import {parseRequestTimelineTimestamp} from '../request-timeline.mjs';
import {recordedBreakdownRangeLength} from './dashboard-breakdown-forecast.mjs';

export const DAILY_BD_METRICS = [
  {key: 'open', label: 'Opening BD'},
  {key: 'incoming', label: 'BD In'},
  {key: 'outgoing', label: 'BD Out'},
  {key: 'balance', label: 'Closing balance'},
];

export function shiftBdDate(date, days) {
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) ? new Date(time + days * 86400000).toISOString().slice(0, 10) : '';
}

// Count requests once. A closure must have an actual timestamp; a Closed status
// cannot tell us which historical day's BD Out it belongs to.
export function prepareDailyBdRequests(records = []) {
  const unique = new Map();
  const updated = record => parseRequestTimelineTimestamp(record.updatedAt)?.getTime() || Date.parse(requestDateKey(record.updatedAt)) || 0;
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    const key = String(record.ref || record.reference || (record.id != null ? `id:${record.id}` : '')).trim() || record;
    const previous = unique.get(key);
    if (!previous || updated(record) >= updated(previous)) unique.set(key, record);
  }
  const entries = [], excluded = [];
  for (const record of unique.values()) {
    const startedValue = [record.start, record.startedAt, record.createdAt].find(value => requestDateKey(value));
    const closedValue = [record.closedAt, record.completedAt].find(value => requestDateKey(value));
    const opened = requestDateKey(startedValue), closed = requestDateKey(closedValue);
    const hasTimes = ![startedValue, closedValue].some(value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim()));
    const reversed = closed && (closed < opened || (hasTimes && parseRequestTimelineTimestamp(closedValue) < parseRequestTimelineTimestamp(startedValue)));
    const missingClosure = !closed && (String(record.status || '').trim().toLowerCase() === 'closed' || Boolean(record.closedAt || record.completedAt));
    if (!opened || missingClosure || reversed) excluded.push(record);
    else entries.push({record, opened, closed});
  }
  return {entries, excluded};
}

export function bdBalanceChange(opening, closing) {
  const delta = closing - opening;
  const percent = opening > 0 ? delta / opening * 100 : delta === 0 ? 0 : null;
  return {delta, percent, direction: delta > 0 ? 'increase' : delta < 0 ? 'decrease' : 'steady'};
}

export function dailyBdRecordsForMetric(records, from, to, metric) {
  const {entries, excluded} = prepareDailyBdRequests(records);
  if (metric === 'undated') return excluded;
  if (!recordedBreakdownRangeLength(from, to)) return [];
  return entries.filter(({opened, closed}) => {
    if (metric === 'open') return opened < from && (!closed || closed >= from);
    if (metric === 'incoming') return opened >= from && opened <= to;
    if (metric === 'outgoing') return Boolean(closed) && closed >= from && closed <= to;
    if (metric === 'balance') return opened <= to && (!closed || closed > to);
    return false;
  }).map(({record}) => record);
}

export function buildDailyBdBalance(records, from, to) {
  const count = recordedBreakdownRangeLength(from, to);
  const {entries, excluded} = prepareDailyBdRequests(records);
  if (!count) return {days: [], totals: null, excluded};
  const intake = new Map(), closures = new Map();
  let opening = 0;
  for (const {opened, closed} of entries) {
    if (opened < from && (!closed || closed >= from)) opening++;
    if (opened >= from && opened <= to) intake.set(opened, (intake.get(opened) || 0) + 1);
    if (closed && closed >= from && closed <= to) closures.set(closed, (closures.get(closed) || 0) + 1);
  }
  const totals = {open: opening, incoming: 0, outgoing: 0, balance: opening};
  const days = Array.from({length: count}, (_, index) => {
    const date = shiftBdDate(from, index), incoming = intake.get(date) || 0, outgoing = closures.get(date) || 0;
    const balance = opening + incoming - outgoing;
    const row = {date, open: opening, incoming, outgoing, balance, ...bdBalanceChange(opening, balance)};
    totals.incoming += incoming;
    totals.outgoing += outgoing;
    totals.balance = opening = balance;
    return row;
  });
  return {days, totals: {...totals, ...bdBalanceChange(totals.open, totals.balance)}, excluded};
}
