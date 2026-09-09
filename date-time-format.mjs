export const INDIA_TIME_ZONE = 'Asia/Kolkata';

const INDIA_OFFSET_MINUTES = 330;
const DATE_PREFIX_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[T\s\u00b7\u00c2]+(\d{2}):(\d{2})(?::(\d{2}))?/;
const TIME_ONLY_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

const pad = (value) => String(value).padStart(2, '0');

function localDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const text = String(value ?? '').trim();
  if (!text) return null;
  const dateOnlyMatch = text.match(DATE_ONLY_PATTERN);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)) - (INDIA_OFFSET_MINUTES * 60 * 1000));
  }
  const localMatch = text.match(LOCAL_DATE_TIME_PATTERN);
  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
  if (localMatch && !hasExplicitZone) {
    const [, year, month, day, hour, minute, second = '00'] = localMatch;
    const utcTime = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
      - (INDIA_OFFSET_MINUTES * 60 * 1000);
    const date = new Date(utcTime);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function indiaParts(value) {
  const date = localDate(value);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: INDIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({type, value: partValue}) => [type, partValue]));
}

function fallback(value, emptyValue) {
  const text = String(value ?? '').trim();
  return text || emptyValue;
}

export function formatDisplayDate(value, emptyValue = '—') {
  const text = String(value ?? '').trim();
  const dateOnly = text.match(DATE_PREFIX_PATTERN);
  if (dateOnly && !LOCAL_DATE_TIME_PATTERN.test(text)) {
    return `${dateOnly[3]}-${dateOnly[2]}-${dateOnly[1]}`;
  }
  const parts = indiaParts(value);
  return parts ? `${parts.day}-${parts.month}-${parts.year}` : fallback(value, emptyValue);
}

export function formatDisplayTime(value, emptyValue = '—') {
  const timeOnly = String(value ?? '').trim().match(TIME_ONLY_PATTERN);
  if (timeOnly) {
    const hour24 = Number(timeOnly[1]) % 24;
    return `${pad(hour24 % 12 || 12)}:${timeOnly[2]}:${timeOnly[3] || '00'} ${hour24 >= 12 ? 'PM' : 'AM'}`;
  }
  const parts = indiaParts(value);
  if (!parts) return fallback(value, emptyValue);
  const hour24 = Number(parts.hour) % 24;
  const hour12 = hour24 % 12 || 12;
  return `${pad(hour12)}:${parts.minute}:${parts.second} ${hour24 >= 12 ? 'PM' : 'AM'}`;
}

export function formatDisplayDateTime(value, emptyValue = '—') {
  const parts = indiaParts(value);
  if (!parts) return fallback(value, emptyValue);
  const hour24 = Number(parts.hour) % 24;
  const hour12 = hour24 % 12 || 12;
  return `${parts.day}-${parts.month}-${parts.year} ${pad(hour12)}:${parts.minute}:${parts.second} ${hour24 >= 12 ? 'PM' : 'AM'}`;
}

export function formatDisplayDateRange(start, end, separator = ' to ') {
  return `${formatDisplayDate(start)}${separator}${formatDisplayDate(end)}`;
}
