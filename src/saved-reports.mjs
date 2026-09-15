/**
 * Saved table reports: a user saves the current view of any Actions table
 * (visible columns, filters, sort, date range) under a name, can reopen it later
 * and can print it straight away. Shared by the browser and the server.
 */
export const SAVED_REPORT_NAME_MAX_LENGTH = 80;
export const SAVED_REPORT_STATE_MAX_CHARS = 20000;

export function normalizeSavedReportName(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function savedReportValidationError({ name = "", key = "", state = {} } = {}) {
  const cleanName = normalizeSavedReportName(name);
  if (!String(key ?? "").trim()) return "This table cannot be saved.";
  if (!cleanName) return "Give the report a name before saving.";
  if (cleanName.length > SAVED_REPORT_NAME_MAX_LENGTH) return `Keep the report name within ${SAVED_REPORT_NAME_MAX_LENGTH} characters.`;
  let encoded = "";
  try { encoded = JSON.stringify(state ?? {}); } catch { return "This report view cannot be saved."; }
  if (!encoded || encoded.length > SAVED_REPORT_STATE_MAX_CHARS) return "This report view is too large to save.";
  return "";
}

/** Stable key for a table: its title plus the column set, so two reports with the same title but different columns stay apart. */
export function savedReportKey(title = "", columns = []) {
  const keys = (Array.isArray(columns) ? columns : []).map((column) => String(column?.key ?? column ?? "")).filter(Boolean);
  return `${String(title ?? "").trim().toLowerCase().slice(0, 120) || "table"}|${keys.join(",")}`.slice(0, 400);
}

export function defaultSavedReportName(title = "", date = new Date()) {
  const day = String(date.getDate()).padStart(2, "0"), month = String(date.getMonth() + 1).padStart(2, "0");
  const base = normalizeSavedReportName(title).slice(0, 60) || "Report";
  return `${base} ${day}-${month}-${date.getFullYear()}`;
}

/** The part of a table view worth saving. */
export function serializeTableView({ visible = [], filters = {}, sort = {}, dateRange = "", pageSize = 0 } = {}) {
  return {
    visible: (Array.isArray(visible) ? visible : []).map(String),
    filters: Object.fromEntries(Object.entries(filters || {}).filter(([, value]) => String(value ?? "").trim()).map(([key, value]) => [key, String(value)])),
    sort: { key: String(sort?.key || ""), direction: sort?.direction === "desc" ? "desc" : "asc" },
    dateRange: String(dateRange || ""),
    ...(pageSize ? { pageSize: Number(pageSize) } : {}),
  };
}

/** Apply a saved view only where the current table still has those columns. */
export function sanitizeTableView(state = {}, columns = []) {
  const known = new Set((Array.isArray(columns) ? columns : []).map((column) => String(column?.key ?? column ?? "")));
  const view = serializeTableView(state || {});
  return {
    visible: view.visible.filter((key) => known.has(key)),
    filters: Object.fromEntries(Object.entries(view.filters).filter(([key]) => known.has(key))),
    sort: known.has(view.sort.key) ? view.sort : { key: "", direction: "asc" },
    dateRange: view.dateRange,
    pageSize: view.pageSize || 0,
  };
}

/** Who a saved report belongs to: the login, or the name when a record has no login. */
export function savedReportUserKey(session = {}) {
  const login = String(session?.login || "").trim().toLowerCase();
  return login || `name:${String(session?.name || "").trim().toLowerCase()}`;
}

/** The signed-in session token kept by the app shell (browser only). */
export function storedSessionToken() {
  try {
    const raw = localStorage.getItem("nerveCenterSession") || sessionStorage.getItem("nerveCenterSession");
    return raw ? String(JSON.parse(raw)?.token || "") : "";
  } catch {
    return "";
  }
}
