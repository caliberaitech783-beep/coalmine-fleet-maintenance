import { formatDisplayDate } from "../date-time-format.mjs";
import { dateKeyOf, matchesDateRange, parseDateRange } from "./date-range-filter.mjs";

// Use the same Indian calendar day that the record displays, including zoned API timestamps.
export function recordDateKey(value) {
  if (value instanceof Date || /[T ]\d{2}:\d{2}.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(String(value ?? ""))) {
    return dateKeyOf(formatDisplayDate(value, ""));
  }
  return dateKeyOf(value);
}

export function filterRecordsByDate(rows, value, dateOf) {
  const range = parseDateRange(value);
  return range ? rows.filter((row) => matchesDateRange(recordDateKey(dateOf(row)), range)) : rows;
}

// Prefer the request's start over later workflow events. Undated masters must not
// accidentally filter by an expiry date, duration, registration number or employee DOB.
export function primaryRecordDateColumn(columns) {
  const priorities = [
    /^(start|started|started at|start date|production submission|production date|request date)$/i,
    /^(date|created|created at|created on|created date|ticket created|ticket created at|createdAt)$/i,
    /^(occurredAt|occurred at|timestamp|date & time|date and time|updatedAt|updated at|updated on)$/i,
    /^(closedAt|closed|closed at|closing time|bd closing time|verifiedAt|verified date & time|mis verified at|acceptedAt|vehicle received|red flag raised|mis red flag raised)$/i,
  ];
  for (const pattern of priorities) {
    const column = columns.find(({ key, label }) => pattern.test(String(key).replace(/^\d+:/, "")) || pattern.test(label.trim()));
    if (column) return column;
  }
  return null;
}
