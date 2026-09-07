import { fleetBreakdownCaseCounts } from "../dashboard-equipment-metrics.mjs";
import { recordBelongsToSite } from "../site-location.mjs";

// Use the same site asset matching and registration fallback as the chart counts.
export function fleetBreakdownCategory(records, request) {
  const site = request.site || request.location;
  const siteRecords = site ? records.filter((record) => recordBelongsToSite(record, site)) : records;
  return fleetBreakdownCaseCounts(siteRecords, [request]).vehicles ? "Vehicles" : "Equipment";
}

export function fleetBreakdownRequests(records, requests, { site = "", sites, category = "" } = {}) {
  return requests.filter((request) => String(request.status || "").trim().toLowerCase() !== "closed"
    && (!site || recordBelongsToSite(request, site))
    && (!sites || sites.some((name) => recordBelongsToSite(request, name)))
    && (!category || fleetBreakdownCategory(records, request) === category));
}
