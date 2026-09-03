const hiddenClosers = new Set(["anoop paul", "maimaintenance manager", "sanskar manohare"]);
const normalize = (value) => String(value ?? "").trim().toLowerCase();

// Display-only: the request and its related records remain persisted.
export function visibleInMaintenanceHistory(row) {
  return !(normalize(row.status) === "closed"
    && hiddenClosers.has(normalize(row.closedBy)));
}
