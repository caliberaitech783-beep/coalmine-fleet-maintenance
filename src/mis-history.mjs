const normalize = (value) => String(value ?? "").trim().toLowerCase();
const hasProductionFirstTrip = (row = {}) => Boolean(String(row.productionFirstTripAt ?? row.production_first_trip_at ?? "").trim());

// Access and site scope are applied by the API. Queue membership depends only
// on lifecycle state, never on a person's name or a historical test reference.
export function visibleInMisRequests(row = {}) {
  return normalize(row.status) === "closed" && !normalize(row.verifiedAt);
}

export function visibleInMisHistory(row = {}) {
  return normalize(row.status) === "closed" && Boolean(normalize(row.verifiedAt)) && hasProductionFirstTrip(row);
}
