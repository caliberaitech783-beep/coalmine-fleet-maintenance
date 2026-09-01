const INDIA_OFFSET_MINUTES = 330;

export function indiaDateTimeInputValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + INDIA_OFFSET_MINUTES * 60_000).toISOString().slice(0, 16);
}

export function indiaDateTimeEpoch(value) {
  const text = String(value || "").trim();
  if (!text) return Number.NaN;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(text)) return new Date(text).getTime();
  const normalized = text.replace(" ", "T");
  const withTime = /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? `${normalized}T00:00:00` : normalized;
  return new Date(`${withTime}+05:30`).getTime();
}

export function validReportDateRange(from, to) {
  const fromEpoch = indiaDateTimeEpoch(from);
  const toEpoch = indiaDateTimeEpoch(to);
  return Number.isFinite(fromEpoch) && Number.isFinite(toEpoch) && fromEpoch <= toEpoch;
}

export function reportRowsWithinRange(rows = [], dateValue, from, to, { includeUndated = false } = {}) {
  if (!validReportDateRange(from, to)) return [];
  const fromEpoch = indiaDateTimeEpoch(from);
  const toEpoch = indiaDateTimeEpoch(to);
  return rows.filter((row) => {
    const timestamp = indiaDateTimeEpoch(dateValue?.(row));
    return Number.isFinite(timestamp) ? timestamp >= fromEpoch && timestamp <= toEpoch : includeUndated;
  });
}
