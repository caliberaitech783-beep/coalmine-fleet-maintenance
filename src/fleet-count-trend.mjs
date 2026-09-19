// The operating day is shared by every device and starts at midnight in India.
const INDIA_OFFSET_MS = 330 * 60_000;

export function indiaCountDayWindow(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) throw new TypeError("A valid timestamp is required.");
  const day = new Date(date.getTime() + INDIA_OFFSET_MS).toISOString().slice(0, 10);
  const openingAt = new Date(`${day}T00:00:00+05:30`);
  return { day, openingAt, nextMidnightAt: new Date(openingAt.getTime() + 86_400_000) };
}

export function resolveCountTrend(previous, current) {
  if (!Number.isFinite(previous) || !Number.isFinite(current) || previous === current) return null;
  return current > previous ? "up" : "down";
}

export function dailyCountChange(open, current, day) {
  if (!Number.isSafeInteger(open) || !Number.isSafeInteger(current) || open < 0 || current < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const delta = current - open;
  return { day, open, current, delta, direction: resolveCountTrend(open, current) ?? "flat" };
}

export function formatCountDelta(delta) {
  if (!Number.isFinite(delta) || delta === 0) return "0";
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta).toLocaleString()}`;
}
