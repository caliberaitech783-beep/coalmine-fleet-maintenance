import { indiaDateTimeEpoch } from "../report-date-range.mjs";

// Availability is a fleet snapshot at the end of the selected IST day, not
// just the requests opened that day. Leave the existing live view unchanged.
export function availabilityRequestsForDate(requests = [], date = "") {
  if (!date) return requests;
  const cutoff = indiaDateTimeEpoch(date) + 86400000 - 1;
  if (!Number.isFinite(cutoff)) return [];

  return requests.flatMap((request) => {
    const startedAt = [request.start, request.startedAt, request.createdAt]
      .map(indiaDateTimeEpoch).find(Number.isFinite);
    if (!Number.isFinite(startedAt) || startedAt > cutoff) return [];
    const status = String(request.status || "").trim().toLowerCase();
    const closedAt = indiaDateTimeEpoch(request.closedAt || request.idealApprovedAt);
    if (status === "closed" && Number.isFinite(closedAt) && closedAt <= cutoff) return [];
    // A legacy closed record with no closure time cannot establish a past
    // active interval. Do not invent one from its submission date alone.
    if (status === "closed" && !Number.isFinite(closedAt)) return [];
    const idleAt = indiaDateTimeEpoch(request.idealRequestedAt || (["idle", "ideal"].includes(status) ? request.closedAt : ""));
    const idle = Number.isFinite(idleAt)
      ? idleAt <= cutoff
      : ["idle", "ideal"].includes(status);
    return [{ ...request, status: idle ? "Idle" : "Open" }];
  });
}
