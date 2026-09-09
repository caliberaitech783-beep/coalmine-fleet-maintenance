const normalize = (value) => String(value ?? "").trim().toLowerCase();

// API-authorized closed entries stay visible regardless of who closed them.
export function visibleInMaintenanceHistory(row = {}) {
  return normalize(row.status) === "closed";
}
