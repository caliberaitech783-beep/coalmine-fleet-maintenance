import {reportTime12} from './report-time-format.mjs';
import {indiaDateTimeEpoch} from './report-date-range.mjs';
import {normalizeShiftRecord} from './shift-master.mjs';
import {canonicalSiteName} from './site-location.mjs';

export const ALL_SHIFTS_KEY = 'all';

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

export function shiftFilterOptions(records = []) {
  const options = new Map();
  for (const shift of safeShiftRecords(records)) {
    const key = clean(shift.shiftCode).toUpperCase();
    if (!key || options.has(key)) continue;
    options.set(key,{key,label:`${key} Shift`});
  }
  return [...options.values()].sort((a,b)=>a.key.localeCompare(b.key,undefined,{numeric:true}));
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

function shiftEffectiveOnBusinessDate(shift, date) {
  return (!shift.effectiveFrom || shift.effectiveFrom <= date) && (!shift.effectiveTo || date <= shift.effectiveTo);
}

function previousLocalDate(date) {
  const epoch = indiaDateTimeEpoch(`${date}T00:00:00`);
  return Number.isFinite(epoch) ? localDateKey(new Date(epoch - 86400000)) : '';
}

export function shiftWindowForDate(date, {site = '', shifts = [], shift = ALL_SHIFTS_KEY} = {}) {
  const selected = clean(shift).toUpperCase();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(date)) || !selected || selected.toLowerCase() === ALL_SHIFTS_KEY) return null;
  const siteKey = canonicalSiteName(site);
  const record = safeShiftRecords(shifts).find((item) => canonicalSiteName(item.site) === siteKey
    && clean(item.shiftCode).toUpperCase() === selected && shiftEffectiveOnBusinessDate(item,date));
  if (!record) return null;
  const start = indiaDateTimeEpoch(`${date}T${record.startTime}`);
  let end = indiaDateTimeEpoch(`${date}T${record.endTime}`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (end <= start) end += 86400000;
  return {start,end,record,date};
}

export function timestampMatchesShiftWindow(value, {site = '', shifts = [], shift = ALL_SHIFTS_KEY, from = '', to = '', now = new Date()} = {}) {
  const selected = clean(shift).toUpperCase();
  if (!selected || selected.toLowerCase() === ALL_SHIFTS_KEY) return true;
  const epoch = indiaDateTimeEpoch(value), nowEpoch = indiaDateTimeEpoch(now);
  const localDate = localDateKey(value);
  if (!Number.isFinite(epoch) || !Number.isFinite(nowEpoch) || !localDate) return false;
  const first = clean(from || to), last = clean(to || from);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(first) || !/^\d{4}-\d{2}-\d{2}$/.test(last) || first > last) return false;
  return [localDate,previousLocalDate(localDate)].some((businessDate) => {
    if (businessDate < first || businessDate > last) return false;
    const window = shiftWindowForDate(businessDate,{site,shifts,shift:selected});
    return Boolean(window && nowEpoch >= window.start && epoch >= window.start && epoch < window.end && epoch <= nowEpoch);
  });
}

export function resolveShiftForTimestamp(value, {site = '', shifts = []} = {}) {
  const siteKey = canonicalSiteName(site);
  const candidates = safeShiftRecords(shifts)
    .filter((shift) => canonicalSiteName(shift.site) === siteKey && shiftEffectiveForDate(shift, value));
  return candidates.find((shift) => shiftCoversTime(shift, value)) || null;
}

export function timestampMatchesShift(value, {site = '', shifts = [], shift = ALL_SHIFTS_KEY} = {}) {
  const selected = clean(shift).toUpperCase();
  if (!selected || selected.toLowerCase() === ALL_SHIFTS_KEY) return true;
  const resolved = resolveShiftForTimestamp(value,{site,shifts});
  return clean(resolved?.shiftCode).toUpperCase() === selected;
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
