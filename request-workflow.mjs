import { parseIndiaRequestDateTime } from "./request-time.mjs";

export const REQUEST_CLOSE_STATUSES = ["In progress", "Awaiting parts", "Closed"];
export const MAX_TRIP_CARD_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_REQUEST_AUDIO_BYTES = 3 * 1024 * 1024;

export function validTripCardImageDataUrl(value = "") {
  const match = String(value).match(/^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return false;
  const padding = match[1].endsWith("==") ? 2 : match[1].endsWith("=") ? 1 : 0;
  return Math.floor((match[1].length * 3) / 4) - padding <= MAX_TRIP_CARD_IMAGE_BYTES;
}

export function validRequestAudioDataUrl(value = "") {
  if (!value) return true;
  const match = String(value).match(/^data:audio\/(?:webm|ogg|mp4|mpeg|wav);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return false;
  const padding = match[1].endsWith("==") ? 2 : match[1].endsWith("=") ? 1 : 0;
  return Math.floor((match[1].length * 3) / 4) - padding <= MAX_REQUEST_AUDIO_BYTES;
}

export function requestDateTimeValue(date, time) {
  const day = String(date || "").trim();
  const clock = String(time || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(clock)) return null;
  const parsed = parseIndiaRequestDateTime(`${day} · ${clock}`, null);
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

export function requestMayBeChanged(request = {}) {
  return !request.closedAt && !request.verifiedAt && String(request.status || "").toLowerCase() !== "closed";
}

export function requestMayBeVerified(request = {}) {
  return String(request.status || "").toLowerCase() === "closed" && !request.verifiedAt;
}
