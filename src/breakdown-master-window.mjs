import {requestDateKey} from "./dashboard-request-data.mjs";
import {isIdleVehicleRequest} from "../request-idle.mjs";

// Breakdown master builds a table row for every request it is given. On 13 Nov 2026 that was
// 21,068 requests and the screen froze for 18 to 24 seconds on opening, to show 25 rows.
// It now opens on the requests people act on: everything still open, and everything opened,
// closed or verified in the last few days. The rest stays one click away.
export const BREAKDOWN_MASTER_RECENT_DAYS = 7;

const ACTIVITY_FIELDS = ["start", "startedAt", "createdAt", "closedAt", "verifiedAt", "runningBdAt"];

// The first day of a window of `days` days that ends on `today` (both YYYY-MM-DD).
export function recentBreakdownCutoff(today, days = BREAKDOWN_MASTER_RECENT_DAYS) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(today ?? "").trim());
  const span = Number.isInteger(days) && days > 0 ? days : BREAKDOWN_MASTER_RECENT_DAYS;
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() - (span - 1));
  return date.toISOString().slice(0, 10);
}

export function isRecentBreakdownRow(row = {}, cutoff = "") {
  // Without a usable cutoff nothing may be hidden.
  if (!cutoff) return true;
  if (String(row?.status ?? "").trim().toLowerCase() !== "closed") return true;
  // Closed for maintenance, but the vehicle is still held idle: it is live work.
  if (isIdleVehicleRequest(row)) return true;
  const days = ACTIVITY_FIELDS.map((field) => requestDateKey(row?.[field])).filter(Boolean);
  // A record that cannot be dated is never hidden.
  if (!days.length) return true;
  return days.some((day) => day >= cutoff);
}

export function recentBreakdownRows(rows = [], {today, days = BREAKDOWN_MASTER_RECENT_DAYS} = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const cutoff = recentBreakdownCutoff(today, days);
  const recent = list.filter((row) => isRecentBreakdownRow(row, cutoff));
  return {rows: recent, total: list.length, hidden: list.length - recent.length, cutoff};
}
