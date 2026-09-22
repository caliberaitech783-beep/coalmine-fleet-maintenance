import { reportTime12 } from "../report-time-format.mjs";

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

const exportField = (value, fallback = "Not recorded") => String(value ?? "").replace(/\s+/g, " ").trim() || fallback;

// Structured rows let Excel keep one saved update per worksheet row. This avoids Excel's
// maximum row-height limit while retaining the same values used by PDF and Smart Print.
export function dailyUpdatesExportRows(updates, { category = "" } = {}) {
  return sortDailyUpdates(updates, "oldest").map((item) => ({
    number: item.ordinal,
    dateTime: dailyUpdateStamp(item) ? reportTime12(dailyUpdateStamp(item)) : "Date not recorded",
    author: exportField(dailyUpdateAuthor(item)),
    update: exportField(item.remark),
    breakdownType: exportField(category),
    delayedReason: exportField(dailyUpdateReason(item)),
  }));
}

// Dashboard table exports can contain rendered rows rather than the original request objects.
// Rebuild the structured update records from the complete, line-separated export text in that case.
export function dailyUpdatesExportRowsFromText(value, { category = "" } = {}) {
  const lines = String(value ?? "").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && line !== "—");
  return lines.map((line, index) => {
    const prefix = line.match(/^#(\d+)\s*\|\s*/);
    const body = prefix ? line.slice(prefix[0].length) : line;
    const byMarker = " | By: ", updateMarker = " | Update: ", typeMarker = " | Type: ", reasonMarker = " | Delayed reason: ";
    const byAt = body.indexOf(byMarker), updateAt = byAt < 0 ? -1 : body.indexOf(updateMarker, byAt + byMarker.length);
    const reasonAt = body.lastIndexOf(reasonMarker);
    if (byAt < 0 || updateAt < 0 || reasonAt < updateAt) return {
      number: Number(prefix?.[1]) || index + 1,
      dateTime: "Date not recorded",
      author: "Not recorded",
      update: exportField(line),
      breakdownType: exportField(category),
      delayedReason: "Not recorded",
    };
    const beforeReason = body.slice(updateAt + updateMarker.length, reasonAt);
    const typeAt = beforeReason.lastIndexOf(typeMarker);
    return {
      number: Number(prefix?.[1]) || index + 1,
      dateTime: exportField(body.slice(0, byAt), "Date not recorded"),
      author: exportField(body.slice(byAt + byMarker.length, updateAt)),
      update: exportField(typeAt < 0 ? beforeReason : beforeReason.slice(0, typeAt)),
      breakdownType: exportField(typeAt < 0 ? category : beforeReason.slice(typeAt + typeMarker.length)),
      delayedReason: exportField(body.slice(reasonAt + reasonMarker.length)),
    };
  });
}

// Complete, stable text for detailed exports. The export is chronological regardless of the
// reader's on-screen newest/oldest preference, and each saved update stays on its own line.
export function dailyUpdatesExportText(updates, { category = "" } = {}) {
  const records = dailyUpdatesExportRows(updates, { category });
  if (!records.length) return "—";
  return records.map((item) => [
    `#${item.number}`,
    item.dateTime,
    `By: ${item.author}`,
    `Update: ${item.update}`,
    ...(category ? [`Type: ${item.breakdownType}`] : []),
    `Delayed reason: ${item.delayedReason}`,
  ].join(" | ")).join("\n");
}
