// A column filter is one string. Several chosen values travel as "__any__:" + JSON so the same
// filter state, Actions dialog, print and export paths keep working. A single value stays a plain string.
export const MULTI_FILTER_PREFIX = "__any__:";
export const EMPTY_FILTER_VALUE = "__empty_table_filter_value__";

export function parseFilterValues(filterValue) {
  if (typeof filterValue !== "string" || !filterValue) return [];
  if (!filterValue.startsWith(MULTI_FILTER_PREFIX)) return [filterValue];
  try {
    const values = JSON.parse(filterValue.slice(MULTI_FILTER_PREFIX.length));
    return Array.isArray(values) ? values.filter((value) => typeof value === "string") : [];
  } catch { return []; }
}

export function encodeFilterValues(values) {
  const unique = [...new Set(values.filter((value) => typeof value === "string" && value))];
  if (!unique.length) return "";
  if (unique.length === 1) return unique[0];
  return MULTI_FILTER_PREFIX + JSON.stringify(unique);
}

export function toggleFilterValue(filterValue, value) {
  const current = parseFilterValues(filterValue);
  return encodeFilterValues(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
}

export function filterValueSelected(filterValue, value) {
  return parseFilterValues(filterValue).includes(value);
}

// Does a cell's text satisfy the filter? Blank cells match the empty-value sentinel.
export function cellMatchesFilterValues(text, filterValue) {
  const values = parseFilterValues(filterValue);
  if (!values.length) return true;
  const cell = String(text ?? "").trim();
  return values.some((value) => value === EMPTY_FILTER_VALUE ? !cell : cell === value);
}

export function describeFilterValues(filterValue) {
  const values = parseFilterValues(filterValue);
  return values.length > 1 ? `${values.length} values selected` : values[0] === EMPTY_FILTER_VALUE ? "(Blank)" : values[0] || "";
}
