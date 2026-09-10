// Column filters store one string per column. A date range is encoded as
// "__date_range__:<from>|<to>" (ISO dates, either side optional) so it travels
// through the same filter state, Actions dialog, print and export paths.
export const DATE_RANGE_FILTER_PREFIX = "__date_range__:";

export function encodeDateRange(from = "", to = "") {
  const start = String(from || "").trim(), end = String(to || "").trim();
  return start || end ? `${DATE_RANGE_FILTER_PREFIX}${start}|${end}` : "";
}

export function parseDateRange(value) {
  if (typeof value !== "string" || !value.startsWith(DATE_RANGE_FILTER_PREFIX)) return null;
  const [from = "", to = ""] = value.slice(DATE_RANGE_FILTER_PREFIX.length).split("|");
  return { from, to };
}

// "YYYY-MM-DD" for a raw (2026-09-10 15:52:08) or displayed (10-09-2026 03:52:08 PM) value, else "".
export function dateKeyOf(value) {
  const text = String(value ?? "").trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return "";
}

export function matchesDateRange(value, range) {
  const key = dateKeyOf(value);
  if (!key) return false;
  if (range?.from && key < range.from) return false;
  if (range?.to && key > range.to) return false;
  return true;
}

// A column offers the calendar when every recorded value is a date (dashes and blanks ignored).
export function looksLikeDateColumn(values = []) {
  const recorded = values.map((value) => String(value ?? "").trim()).filter((value) => value && value !== "—");
  return recorded.length > 0 && recorded.every((value) => dateKeyOf(value));
}

const displayDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "…");
export function describeDateRange(range) {
  return `Date range ${displayDate(range?.from)} to ${displayDate(range?.to)}`;
}
