// Stock-ticker style change for a live dashboard count: the count is compared
// with today's opening reading (the first value seen on this device today),
// so the arrow and delta move live as the count rises and falls through the day.
export const BREAKDOWN_COUNT_STORAGE_KEY = "fleetBreakdownCountOpen";

export function localDayKey(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function resolveCountTrend(previous, current) {
  if (!Number.isFinite(previous) || !Number.isFinite(current) || previous === current) return null;
  return current > previous ? "up" : "down";
}

function readOpening(storage, key, dayKey) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(key) ?? "null");
    return parsed?.day === dayKey && Number.isFinite(parsed.open) ? parsed.open : null;
  } catch {
    return null;
  }
}

function writeOpening(storage, key, dayKey, open) {
  try {
    storage?.setItem?.(key, JSON.stringify({ day: dayKey, open }));
  } catch {
    // Storage may be unavailable (private mode, quota); the ticker then uses this page load as the opening.
  }
}

// Returns { open, delta, direction } for `current` against today's opening
// reading, recording `current` as the opening when today has none yet.
export function trackCountChange(storage, key, current, dayKey = localDayKey()) {
  if (!Number.isFinite(current)) return null;
  let open = readOpening(storage, key, dayKey);
  if (open === null) {
    open = current;
    writeOpening(storage, key, dayKey, open);
  }
  const delta = current - open;
  return { open, delta, direction: resolveCountTrend(open, current) ?? "flat" };
}

export function formatCountDelta(delta) {
  if (!Number.isFinite(delta) || delta === 0) return "0";
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta).toLocaleString()}`;
}
