const hiddenRequestClosers = new Set(["anoop paul", "maimaintenance manager", "sanskar manohare"]);
const hiddenRequestReferences = new Set(["req-1787759984730"]);
const hiddenHistoryClosers = new Set(["maimaintenance manager", "sanskar manohare"]);
const normalize = (value) => String(value ?? "").trim().toLowerCase();

// Display-only: persisted requests and other workspaces remain unchanged.
export function visibleInMisRequests(row) {
  return !(normalize(row.status) === "closed"
    && (hiddenRequestClosers.has(normalize(row.closedBy))
      || hiddenRequestReferences.has(normalize(row.ref || row.reference))));
}

export function visibleInMisHistory(row) {
  return !(normalize(row.status) === "closed"
    && (normalize(row.verifiedBy) === "damini rai"
      || hiddenHistoryClosers.has(normalize(row.closedBy))));
}
