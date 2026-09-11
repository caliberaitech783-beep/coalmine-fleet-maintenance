// Stock-ticker style change for a live dashboard count. The count is compared
// with today's opening reading: the previous day's closing reading when this
// device has one (like a stock's previous close), otherwise the first value
// seen on the device today. The arrow, delta and badge colour then move live
// as the count rises and falls through the day.
export const BREAKDOWN_COUNT_STORAGE_KEY = "fleetBreakdownCountOpen";

export function localDayKey(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function resolveCountTrend(previous, current) {
  if (!Number.isFinite(previous) || !Number.isFinite(current) || previous === current) return null;
  return current > previous ? "up" : "down";
}

function readRecord(storage, key) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(key) ?? "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeRecord(storage, key, record) {
  try {
    storage?.setItem?.(key, JSON.stringify(record));
  } catch {
    // Storage may be unavailable (private mode, quota); the ticker then uses this page load as the opening.
  }
}

// Returns { open, delta, direction } for `current` against today's opening
// reading, and records `current` as the latest reading (today's running close).
export function trackCountChange(storage, key, current, dayKey = localDayKey()) {
  if (!Number.isFinite(current)) return null;
  const stored = readRecord(storage, key);
  let open;
  if (stored?.day === dayKey && Number.isFinite(stored.open)) open = stored.open;
  else if (stored && stored.day !== dayKey && Number.isFinite(stored.last)) open = stored.last;
  else open = current;
  writeRecord(storage, key, { day: dayKey, open, last: current });
  const delta = current - open;
  return { open, delta, direction: resolveCountTrend(open, current) ?? "flat" };
}

export function formatCountDelta(delta) {
  if (!Number.isFinite(delta) || delta === 0) return "0";
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta).toLocaleString()}`;
}
