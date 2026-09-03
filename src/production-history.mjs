const hiddenCreators = new Set(["stupal moon", "sanskar manohare"]);
const hiddenClosers = new Set(["maimaintenance manager", "anoop paul"]);
const normalize = (value) => String(value ?? "").trim().toLowerCase();

// Display-only exclusion: persisted requests and other workspaces are unchanged.
export function visibleInProductionHistory(row) {
  return !(normalize(row.status) === "closed"
    && hiddenCreators.has(normalize(row.owner))
    && hiddenClosers.has(normalize(row.closedBy)));
}
