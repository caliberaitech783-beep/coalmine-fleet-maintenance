const normalize = (value) => String(value ?? "").trim().toLowerCase();

// API-authorized closed entries stay visible before and after MIS verification.
export function visibleInProductionHistory(row = {}) {
  return normalize(row.status) === "closed";
}
