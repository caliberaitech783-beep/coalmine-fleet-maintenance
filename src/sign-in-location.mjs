// Records where a user signed in from (owner, 15 Nov 2026, after the uKnowva
// punch screen). The browser shows its own "Allow location?" prompt. Owner's
// rule: pressing Block keeps the app closed; a device that cannot find a
// location is let in and shown as "Not available". The server decides.
import {SITE_COORDINATES, DEFAULT_COORDINATES} from "./live-temperature.mjs";

export const SIGN_IN_LOCATION_NOTICE = "Pulse needs your location to open. It is recorded at every sign-in, for attendance and security.";
// v2: answers saved under the first version (when Block still opened the app) must be asked again.
const DONE_KEY = "pulse-sign-in-location-v2";

// Not the token itself: only enough to tell one sign-in from the next.
export function sessionMark(token = "") {
  let hash = 2166136261;
  for (const character of String(token)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return hash.toString(36);
}

export function readPosition({geolocation = globalThis.navigator?.geolocation, timeoutMs = 20000} = {}) {
  return new Promise(resolve => {
    if (!geolocation || typeof geolocation.getCurrentPosition !== "function") return resolve({status: "unavailable"});
    try {
      geolocation.getCurrentPosition(
        position => resolve({
          status: "shared",
          latitude: Number(position.coords.latitude),
          longitude: Number(position.coords.longitude),
          accuracy: Number.isFinite(position.coords.accuracy) ? Number(position.coords.accuracy) : undefined,
        }),
        // 1 = the user (or a browser setting) refused; 2 and 3 = the device could not find a position.
        error => resolve({status: error?.code === 1 ? "refused" : "unavailable"}),
        {enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 120000},
      );
    } catch {
      resolve({status: "unavailable"});
    }
  });
}

/** true / false from the server; null when it could not be asked (the app then opens). */
export async function fetchSignInLocationRequired(token, {fetchImpl = globalThis.fetch} = {}) {
  if (!token || typeof fetchImpl !== "function") return null;
  try {
    const response = await fetchImpl("/api/session-location", {cache: "no-store", headers: {Authorization: `Bearer ${token}`}});
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data?.required === "boolean" ? data.required : null;
  } catch {
    return null;
  }
}

function storageGet(storage, key) { try { return storage?.getItem(key) || ""; } catch { return ""; } }
function storageSet(storage, key, value) { try { storage?.setItem(key, value); } catch {} }

/** True when this sign-in has already been let through (no prompt needed). */
export function signInLocationDone(token, storage = globalThis.localStorage) {
  return Boolean(token) && storageGet(storage, DONE_KEY) === sessionMark(token);
}

/**
 * Asks the browser and reports the answer. Returns {status, accepted}:
 * accepted true = open the app, false = keep the location screen up,
 * null = the server could not be asked (its own checks still apply).
 * An unanswered prompt simply keeps waiting: it is never saved as "Not available".
 */
export async function recordSignInLocation(token, {
  fetchImpl = globalThis.fetch,
  storage = globalThis.localStorage,
  geolocation = globalThis.navigator?.geolocation,
} = {}) {
  if (!token || typeof fetchImpl !== "function") return {status: "", accepted: null};
  if (signInLocationDone(token, storage)) return {status: "done", accepted: true};
  const result = await readPosition({geolocation});
  try {
    const response = await fetchImpl("/api/session-location", {
      method: "POST",
      headers: {"Content-Type": "application/json", Authorization: `Bearer ${token}`},
      body: JSON.stringify(result),
    });
    const data = response.ok ? await response.json().catch(() => ({})) : {};
    const accepted = response.ok ? data.accepted !== false : null;
    if (accepted) storageSet(storage, DONE_KEY, sessionMark(token));
    return {...result, accepted};
  } catch {
    return {...result, accepted: null};
  }
}

const SITE_PLACES = [
  ...Object.values(SITE_COORDINATES).map(site => ({...site, place: `${site.place.split(",")[0]} site`})),
  {...DEFAULT_COORDINATES, place: "Nagpur office"},
];

export function distanceKm(from, to) {
  const radians = value => value * Math.PI / 180;
  const dLat = radians(to.latitude - from.latitude), dLng = radians(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** "Near Sasti site (1.2 km)" or "84 km from Jayant site"; the site points are approximate (about 1 km). */
export function nearestPlaceLabel(latitude, longitude, places = SITE_PLACES) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !places.length) return "";
  let best = null;
  for (const place of places) {
    const km = distanceKm({latitude, longitude}, place);
    if (!best || km < best.km) best = {place: place.place, km};
  }
  const km = best.km < 10 ? best.km.toFixed(1) : String(Math.round(best.km));
  return best.km <= 15 ? `Near ${best.place} (${km} km)` : `${km} km from ${best.place}`;
}

export function formatAccuracy(metres) {
  if (!Number.isFinite(metres)) return "";
  return metres >= 1000 ? `±${(metres / 1000).toFixed(metres >= 10000 ? 0 : 1)} km` : `±${Math.round(metres)} m`;
}

export function mapLink(latitude, longitude) {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

/** What the Location cell shows for one login-history session. */
export function signInLocationCell(item = {}) {
  const status = String(item.locationStatus || "");
  if (status === "shared" && Number.isFinite(item.latitude) && Number.isFinite(item.longitude)) {
    return {
      tone: "shared",
      text: [nearestPlaceLabel(item.latitude, item.longitude), formatAccuracy(item.accuracy)].filter(Boolean).join(" · "),
      href: mapLink(item.latitude, item.longitude),
    };
  }
  if (status === "refused") return {tone: "refused", text: "Refused by user"};
  if (status === "unavailable") return {tone: "unavailable", text: "Not available on this device"};
  return {tone: "none", text: "Not recorded"};
}
