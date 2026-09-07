import { indiaDateTimeEpoch } from "./report-date-range.mjs";

export const REQUEST_ACCEPTANCE_DELAY_MS = 60 * 60 * 1000;

export function requestAwaitingAcceptance(request = {}, now = Date.now()) {
  const status = String(request.status || "Open").trim().toLowerCase();
  if (request.acceptanceRequired !== true || request.acceptedAt || ["closed", "idle", "ideal"].includes(status)) return false;
  const productionTime = indiaDateTimeEpoch(request.start);
  const currentTime = now instanceof Date ? now.getTime() : Number(now);
  return Number.isFinite(productionTime)
    && Number.isFinite(currentTime)
    && currentTime - productionTime >= REQUEST_ACCEPTANCE_DELAY_MS;
}
