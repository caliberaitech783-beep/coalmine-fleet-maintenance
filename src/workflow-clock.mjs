import { indiaDateTimeEpoch } from "../report-date-range.mjs";

// Workflow timestamps are Indian mine time, independent of the device's zone.
// Keep seconds: these values are also sent to the HH:MM:SS API fields.
export function indiaWorkflowDateTimeParts(value = new Date(), fallback = new Date()) {
  const timestamp = indiaDateTimeEpoch(typeof value === "string" ? value.replace("Â·", "·") : value);
  const instant = Number.isFinite(timestamp) ? timestamp : fallback.getTime();
  const local = new Date(instant + 330 * 60_000).toISOString();
  return {date: local.slice(0, 10), time: local.slice(11, 19)};
}
