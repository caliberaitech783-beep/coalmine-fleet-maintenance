// Ordering of the daily maintenance updates listed inside table cells.
// One preference covers every list in the app: a reader who prefers a breakdown's history
// first-to-last sees it that way in every table, and the choice is remembered on this device.
export const DAILY_UPDATES_ORDER_KEY = "nerveCenterDailyUpdatesOrder";
export const DEFAULT_DAILY_UPDATES_ORDER = "newest";
export const DAILY_UPDATES_ORDERS = [
  { value: "newest", label: "Newest first", description: "Latest update at the top (last to first)" },
  { value: "oldest", label: "Oldest first", description: "First update at the top (first to last)" },
];

export function normalizeDailyUpdatesOrder(value) {
  return value === "oldest" ? "oldest" : DEFAULT_DAILY_UPDATES_ORDER;
}

export function readDailyUpdatesOrder(storage) {
  try { return normalizeDailyUpdatesOrder(storage?.getItem?.(DAILY_UPDATES_ORDER_KEY)); }
  catch { return DEFAULT_DAILY_UPDATES_ORDER; }
}

export function storeDailyUpdatesOrder(storage, order) {
  const next = normalizeDailyUpdatesOrder(order);
  // Private browsing or a full store only loses the memory of the choice, not the choice itself.
  try { storage?.setItem?.(DAILY_UPDATES_ORDER_KEY, next); } catch { /* keep the in-page order */ }
  return next;
}

// Server stamps arrive as "YYYY-MM-DD HH:MM" (IST); ISO strings and Date objects compare the same way.
export function dailyUpdateStamp(update) {
  const value = update?.createdAt;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  if (typeof value === "number") return Number.isFinite(value) ? new Date(value).toISOString() : "";
  return String(value ?? "").trim();
}

// Every update gets its chronological position (1 = the first update ever posted) so the "#n" badge
// reads first-to-last whichever way the list is shown.
export function sortDailyUpdates(updates, order = DEFAULT_DAILY_UPDATES_ORDER) {
  const list = (Array.isArray(updates) ? updates : []).filter(Boolean);
  const chronological = list.map((update, index) => ({ update, index, stamp: dailyUpdateStamp(update) }))
    // The server lists newest first, so equal stamps fall back to the reverse of that order.
    .sort((a, b) => (a.stamp < b.stamp ? -1 : a.stamp > b.stamp ? 1 : b.index - a.index))
    .map((entry, position) => ({ ...entry.update, ordinal: position + 1 }));
  return normalizeDailyUpdatesOrder(order) === "oldest" ? chronological : chronological.reverse();
}

export function latestDailyUpdate(updates) {
  return sortDailyUpdates(updates, "newest")[0] || null;
}

// Sort value for a table's Daily updates column: rows with the most recent update sort highest.
export function latestDailyUpdateStamp(updates) {
  return dailyUpdateStamp(latestDailyUpdate(updates));
}

// Author and delayed reason under every field name the tables, the journal and Info Pulse produce.
export function dailyUpdateAuthor(update) {
  return String(update?.authorName || update?.author || update?.authorLogin || "").trim();
}

export function dailyUpdateReason(update) {
  return String(update?.delayedReason || update?.delayReason || "").trim();
}

export function dailyUpdatesCountLabel(count) {
  return `${count} update${count === 1 ? "" : "s"}`;
}
