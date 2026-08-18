const INDIA_OFFSET = "+05:30";

export function parseReportTimestamp(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const text = String(value ?? "").trim();
  if (!text) return null;

  // ISO values with an explicit timezone are already unambiguous.
  if (/T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  // PostgreSQL projections and optimistic client rows use either
  // "YYYY-MM-DD HH:MM" or "YYYY-MM-DD · HH:MM:SS" in India time.
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[^\d]+((?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?)/);
  if (!match) return null;
  const time = match[2].length === 5 ? `${match[2]}:00` : match[2];
  const parsed = new Date(`${match[1]}T${time}${INDIA_OFFSET}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function elapsedMilliseconds(from, to) {
  const start = parseReportTimestamp(from);
  const end = parseReportTimestamp(to);
  if (!start || !end) return null;
  return Math.max(0, end.getTime() - start.getTime());
}

export function elapsedLabel(from, to) {
  const milliseconds = elapsedMilliseconds(from, to);
  if (milliseconds === null) return "—";
  const totalMinutes = Math.floor(milliseconds / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

export function latestTimestamp(values = []) {
  return values
    .map((value) => ({value, parsed: parseReportTimestamp(value)}))
    .filter(({parsed}) => parsed)
    .sort((a, b) => b.parsed.getTime() - a.parsed.getTime())[0]?.value || "—";
}
