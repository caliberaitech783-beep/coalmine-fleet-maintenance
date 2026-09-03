// Display only; report scope must never be copied into a user's site assignment.
export function userMasterLocation(record = {}) {
  for (const value of [record.site, record.location, record.currentLocation, record.managerSites]) {
    const location = String(value ?? "").trim();
    if (location) return location;
  }
  return "Not assigned";
}
