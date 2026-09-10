const DAY_MS = 24 * 60 * 60 * 1000;

export function calculateBreakdownDays(dateValue, timeValue, now = new Date()) {
  const date = String(dateValue || "").trim(),
    time = String(timeValue || "").trim(),
    dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/),
    timeMatch = time.match(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/);

  if (!dateMatch || !timeMatch) return 0;

  const year = Number(dateMatch[1]),
    month = Number(dateMatch[2]),
    day = Number(dateMatch[3]),
    calendarCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day
  ) return 0;

  const startedAt = Date.parse(`${date}T${time}+05:30`),
    currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(startedAt) || !Number.isFinite(currentTime)) return 0;
  return Math.max(0, Math.floor((currentTime - startedAt) / DAY_MS));
}

function splitIndiaDateTime(value) {
  const match = String(value || "").trim().match(
    /^(\d{4}-\d{2}-\d{2})\D+((?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?)$/,
  );
  if (!match) return null;
  return { date: match[1], time: match[2].length === 5 ? `${match[2]}:00` : match[2] };
}

export function calculateBreakdownDaysFromStart(startValue, now = new Date()) {
  const parts = splitIndiaDateTime(startValue);
  if (!parts) return 0;
  return calculateBreakdownDays(parts.date, parts.time, now);
}

function indiaDateTimeEpoch(value) {
  const parts = splitIndiaDateTime(value);
  if (!parts) return NaN;
  const [year, month, day] = parts.date.split("-").map(Number),
    calendarCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day
  ) return NaN;
  return Date.parse(`${parts.date}T${parts.time}+05:30`);
}

// Days, hours and minutes a request has been in breakdown: from its start until it was
// closed, or until now while it is still open. Mirrors the "BD Days / Hrs"
// department report format.
// Whole minutes in breakdown, or -1 when the start time is not recorded (sorts before real values).
export function calculateBreakdownMinutes(startValue, endValue, now = new Date()) {
  const startedAt = indiaDateTimeEpoch(startValue);
  if (!Number.isFinite(startedAt)) return -1;
  const closedAt = indiaDateTimeEpoch(endValue),
    finishedAt = Number.isFinite(closedAt)
      ? closedAt
      : now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(finishedAt)) return -1;
  return Math.floor(Math.max(0, finishedAt - startedAt) / (60 * 1000));
}

export function formatBreakdownDaysHours(startValue, endValue, now = new Date()) {
  const minutes = calculateBreakdownMinutes(startValue, endValue, now);
  if (minutes < 0) return "—";
  const hours = Math.floor(minutes / 60);
  return `${Math.floor(hours / 24)}d ${hours % 24}h ${minutes % 60}m`;
}

// Minutes represented by a "Xd Yh Zm" style label, or -1 when it holds no duration (e.g. "—").
export function durationLabelMinutes(label) {
  const text = String(label || "").trim();
  const days = text.match(/(\d+)\s*d\b/), hours = text.match(/(\d+)\s*h\b/), minutes = text.match(/(\d+)\s*m\b/);
  if (!days && !hours && !minutes) return -1;
  return (days ? Number(days[1]) * 1440 : 0) + (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
}
