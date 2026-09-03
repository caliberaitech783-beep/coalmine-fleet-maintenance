const hiddenCreators = new Set(["stupal moon", "sanskar manohare"]);
const hiddenClosers = new Set(["maimaintenance manager", "anoop paul"]);
const normalize = (value) => String(value ?? "").trim().toLowerCase();

// Display-only exclusion: persisted requests and other workspaces are unchanged.
export function visibleInProductionHistory(row) {
  const additionalShownRecord = normalize(row.owner) === "stupal moon"
    && normalize(row.closedBy) === "sanskar manohare"
    && ["gjkh", "the card is broken."].includes(normalize(row.complaint));
  return !(normalize(row.status) === "closed"
    && ((hiddenCreators.has(normalize(row.owner))
      && hiddenClosers.has(normalize(row.closedBy))) || additionalShownRecord));
}
