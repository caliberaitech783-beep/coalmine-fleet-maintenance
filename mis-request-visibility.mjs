import { canonicalSiteName } from "./site-location.mjs";
import { indiaDateTimeEpoch } from "./report-date-range.mjs";

// Hide existing Dudhichua OB history only for operational users; do not retire
// records globally or use the editable breakdown start date as the cutoff.
export const DUDHICHUA_OPERATIONAL_HIDE_CUTOFF = "2026-09-23T05:04:18Z";
const OPERATIONAL_ROLES = new Set(["Production User", "Maintenance User", "MIS User"]);

// Dashboard-only exclusion also applies to administrators, without changing
// their underlying request feed, workspaces, history or stored records.
export function requestsVisibleToDashboard(rows = []) {
  return rows.filter((row) => {
    if (canonicalSiteName(row?.site) !== "dudhichua ob") return true;
    const created = indiaDateTimeEpoch(row?.createdAt);
    return !Number.isFinite(created) || created > Date.parse(DUDHICHUA_OPERATIONAL_HIDE_CUTOFF);
  });
}

export const MIS_HIDDEN_REQUEST_REFERENCES = new Set([
  "REQ-1787994776734",
  "REQ-1787994588710",
  "REQ-1787759984730",
  "REQ-1787670871030",
]);

// Confirmed stale records retired from every operational surface. Keeping the
// reference here preserves the database history without letting it affect live
// fleet state or duplicate-request checks.
export const GLOBALLY_RETIRED_REQUEST_REFERENCES = new Set([
  "REQ-1788930790041",
]);

export const GLOBALLY_HIDDEN_REQUEST_OWNERS = new Set(["stupal moon"]);
export const GLOBAL_REQUEST_OWNER_HIDE_CUTOFF = "2026-09-09 18:24:44";

export function requestsVisibleGlobally(rows = []) {
  return rows.filter((row) => {
    const reference = String(row?.ref || row?.reference || "").trim().toUpperCase();
    if (GLOBALLY_RETIRED_REQUEST_REFERENCES.has(reference)) return false;
    const owner = String(row?.owner || row?.requesterName || "").trim().toLowerCase();
    const createdAt = String(row?.createdAt || "").trim().replace("T", " ").slice(0, 19);
    return !GLOBALLY_HIDDEN_REQUEST_OWNERS.has(owner) || !createdAt || createdAt > GLOBAL_REQUEST_OWNER_HIDE_CUTOFF;
  });
}

// Apply the same exclusions to authenticated MIS users and embedded MIS workspaces.
export function requestsVisibleToSession(rows = [], session = {}) {
  const visibleRows = requestsVisibleGlobally(rows);
  const globallyVisibleRows = session?.role === "normal" && OPERATIONAL_ROLES.has(session?.assignedRole)
    ? requestsVisibleToDashboard(visibleRows) : visibleRows;
  if (session?.role !== "normal" || session?.assignedRole !== "MIS User") return globallyVisibleRows;
  return requestsVisibleToMisWorkspace(globallyVisibleRows, true);
}

export function requestsVisibleToMisWorkspace(rows = [], isMisWorkspace = false) {
  if (!isMisWorkspace) return rows;
  return rows.filter((row) => !MIS_HIDDEN_REQUEST_REFERENCES.has(String(row?.ref || row?.reference || "").trim().toUpperCase()));
}
