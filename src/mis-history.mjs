const hiddenRequestClosers = new Set(["anoop paul", "maimaintenance manager", "sanskar manohare"]);
const hiddenHistoryClosers = new Set(["maimaintenance manager", "sanskar manohare"]);
const normalize = (value) => String(value ?? "").trim().toLowerCase();

// Display-only: persisted requests and other workspaces remain unchanged.
export function visibleInMisRequests(row) {
  return !(normalize(row.status) === "closed"
    && hiddenRequestClosers.has(normalize(row.closedBy)));
}

export function visibleInMisHistory(row) {
  return !(normalize(row.status) === "closed"
    && (normalize(row.verifiedBy) === "damini rai"
      || hiddenHistoryClosers.has(normalize(row.closedBy))));
}
