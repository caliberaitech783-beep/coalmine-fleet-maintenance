export const MIS_HIDDEN_REQUEST_REFERENCES = new Set([
  "REQ-1787994776734",
  "REQ-1787994588710",
  "REQ-1787759984730",
]);

export const GLOBALLY_HIDDEN_REQUEST_OWNERS = new Set(["stupal moon"]);

export function requestsVisibleGlobally(rows = []) {
  return rows.filter((row) => !GLOBALLY_HIDDEN_REQUEST_OWNERS.has(String(row?.owner || row?.requesterName || "").trim().toLowerCase()));
}

// Apply the same exclusions to authenticated MIS users and embedded MIS workspaces.
export function requestsVisibleToSession(rows = [], session = {}) {
  const globallyVisibleRows = requestsVisibleGlobally(rows);
  if (session?.role !== "normal" || session?.assignedRole !== "MIS User") return globallyVisibleRows;
  return requestsVisibleToMisWorkspace(globallyVisibleRows, true);
}

export function requestsVisibleToMisWorkspace(rows = [], isMisWorkspace = false) {
  if (!isMisWorkspace) return rows;
  return rows.filter((row) => !MIS_HIDDEN_REQUEST_REFERENCES.has(String(row?.ref || row?.reference || "").trim().toUpperCase()));
}
