const hiddenReferences = new Set([
  "req-1788429762428",
  "req-1788428319118",
]);

const normalize = (value) => String(value ?? "").trim().toLowerCase();

// Display-only filter for Production, Maintenance, and MIS user workspaces.
export function visibleInOperationalUserRequests(row = {}) {
  return !hiddenReferences.has(normalize(row.ref || row.reference));
}
