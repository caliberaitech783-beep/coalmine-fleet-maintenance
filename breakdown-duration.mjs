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
