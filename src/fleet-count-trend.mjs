// Direction of change for a live dashboard count, remembered per browser so
// the arrow reflects the change since the count was last seen there.
export const BREAKDOWN_COUNT_STORAGE_KEY = "fleetBreakdownCountSeen";

export function resolveCountTrend(previous, current) {
  if (!Number.isFinite(previous) || !Number.isFinite(current) || previous === current) return null;
  return current > previous ? "up" : "down";
}

export function readStoredCount(storage, key) {
  try {
    const value = Number(storage?.getItem?.(key));
    return Number.isFinite(value) && storage?.getItem?.(key) !== null ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredCount(storage, key, count) {
  try {
    if (Number.isFinite(count)) storage?.setItem?.(key, String(count));
  } catch {
    // Storage may be unavailable (private mode, quota); the arrow simply stays neutral.
  }
}

// Returns the trend to show for `current` and persists it as the new baseline.
export function trackCountTrend(storage, key, current, fallbackTrend = null) {
  if (!Number.isFinite(current)) return fallbackTrend;
  const previous = readStoredCount(storage, key);
  writeStoredCount(storage, key, current);
  return resolveCountTrend(previous, current) ?? fallbackTrend;
}
