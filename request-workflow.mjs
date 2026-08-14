import { parseIndiaRequestDateTime } from "./request-time.mjs";

export const REQUEST_CLOSE_STATUSES = ["In progress", "Awaiting parts", "Closed"];

export function requestDateTimeValue(date, time) {
  const day = String(date || "").trim();
  const clock = String(time || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(clock)) return null;
  const parsed = parseIndiaRequestDateTime(`${day} · ${clock}`, null);
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

export function requestMayBeChanged(request = {}) {
  return !request.closedAt && !request.verifiedAt && String(request.status || "").toLowerCase() !== "closed";
}

export function requestMayBeVerified(request = {}) {
  return String(request.status || "").toLowerCase() === "closed" && !request.verifiedAt;
}
