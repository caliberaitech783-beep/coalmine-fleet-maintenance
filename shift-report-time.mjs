import {reportTime12} from './report-time-format.mjs';
import {indiaDateTimeEpoch} from './report-date-range.mjs';
import {normalizeShiftRecord} from './shift-master.mjs';
import {canonicalSiteName} from './site-location.mjs';

const clean = value => String(value ?? '').trim();
const secondsOfDay = value => {
  const [hour, minute, second = '0'] = clean(value).split(':').map(Number);
  return hour * 3600 + minute * 60 + second;
};
const localDateKey = value => {
  const epoch = indiaDateTimeEpoch(value);
  if (!Number.isFinite(epoch)) return '';
  return new Date(epoch + 330 * 60000).toISOString().slice(0, 10);
};
const localSecondOfDay = value => {
  const epoch = indiaDateTimeEpoch(value);
  if (!Number.isFinite(epoch)) return Number.NaN;
  const date = new Date(epoch + 330 * 60000);
  return date.getUTCHours() * 3600 + date.getUTCMinutes() * 60 + date.getUTCSeconds();
};

function safeShiftRecords(records = []) {
  return records.flatMap((record) => {
    try { return [normalizeShiftRecord(record)]; }
    catch { return []; }
  }).filter((record) => record.status !== 'Inactive');
}

function shiftCoversTime(shift, value) {
  const time = localSecondOfDay(value), start = secondsOfDay(shift.startTime), end = secondsOfDay(shift.endTime);
  if (!Number.isFinite(time) || !Number.isFinite(start) || !Number.isFinite(end)) return false;
  return start < end ? time >= start && time < end : time >= start || time < end;
}

function shiftEffectiveForDate(shift, value) {
  const date = localDateKey(value);
  if (!date) return false;
  return (!shift.effectiveFrom || shift.effectiveFrom <= date) && (!shift.effectiveTo || date <= shift.effectiveTo);
}

export function resolveShiftForTimestamp(value, {site = '', shifts = []} = {}) {
  const siteKey = canonicalSiteName(site);
  const candidates = safeShiftRecords(shifts)
    .filter((shift) => canonicalSiteName(shift.site) === siteKey && shiftEffectiveForDate(shift, value));
  return candidates.find((shift) => shiftCoversTime(shift, value)) || null;
}

export function formatShiftDateTime(value, {site = '', shifts = [], emptyValue = 'Not recorded'} = {}) {
  const text = clean(value);
  if (!text) return emptyValue;
  const formatted = reportTime12(text);
  if (formatted === value && !Number.isFinite(indiaDateTimeEpoch(text))) return text;
  if (!shifts.length) return formatted || text;
  const shift = resolveShiftForTimestamp(text, {site, shifts});
  const label = shift ? `${shift.shiftCode} Shift` : 'Shift not set';
  return `${label} · ${formatted || text}`;
}
