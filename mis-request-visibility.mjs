export const MIS_HIDDEN_REQUEST_REFERENCES = new Set([
  "REQ-1787994776734",
  "REQ-1787994588710",
  "REQ-1787759984730",
  "REQ-1787670871030",
]);

export const GLOBALLY_HIDDEN_REQUEST_OWNERS = new Set(["stupal moon"]);
export const GLOBAL_REQUEST_OWNER_HIDE_CUTOFF = "2026-09-09 18:24:44";

export function requestsVisibleGlobally(rows = []) {
  return rows.filter((row) => {
    const owner = String(row?.owner || row?.requesterName || "").trim().toLowerCase();
    const createdAt = String(row?.createdAt || "").trim().replace("T", " ").slice(0, 19);
    return !GLOBALLY_HIDDEN_REQUEST_OWNERS.has(owner) || !createdAt || createdAt > GLOBAL_REQUEST_OWNER_HIDE_CUTOFF;
  });
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
