const normalize = (value) => String(value ?? "").trim().toLowerCase();

// Access and site scope are applied by the API. Queue membership depends only
// on lifecycle state, never on a person's name or a historical test reference.
export function visibleInMisRequests(row = {}) {
  return ["closed","running bd"].includes(normalize(row.status)) && !normalize(row.verifiedAt);
}

export function visibleInMisHistory(row = {}) {
  return ["closed","running bd"].includes(normalize(row.status)) && Boolean(normalize(row.verifiedAt));
}
