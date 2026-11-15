// Location captured by the browser right after a sign-in (owner, 15 Nov 2026).
// Owner's rule: a device that can share its location must share it, so a user
// who presses Block cannot use the app; a device that cannot find a location
// (no GPS or Wi-Fi, no location API) is let in and shown as "Not available".
// On hold since 15 Nov 2026 (owner): the rule applies only when the App Service
// setting SIGN_IN_LOCATION_REQUIRED is "1". Until then the location is still
// asked for and recorded, and a refusal is shown as "Refused by user".
export const SIGN_IN_LOCATION_STATUSES = Object.freeze(["shared", "refused", "unavailable"]);
export const SIGN_IN_LOCATION_REQUIRED_CODE = "SIGN_IN_LOCATION_REQUIRED";
export const SIGN_IN_LOCATION_REQUIRED_MESSAGE = "Pulse needs your location to open. Reload the page and press Allow when the browser asks.";

// Session upkeep and the location report itself stay open while a location is missing.
const ALWAYS_OPEN = new Set(["/api/session-location", "/api/logout", "/api/session-heartbeat", "/api/session-status", "/api/session-messages"]);
// Never held: machine accounts (no browser) and the owner's chosen logins.
const DEFAULT_EXCEPTIONS = ["mis_sync_service", "mohitchadda"];

const coordinate = (value, limit) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;

export function parseSignInLocation(body = {}) {
  const status = String(body?.status || "").trim().toLowerCase();
  if (!SIGN_IN_LOCATION_STATUSES.includes(status)) return {error: "Send a location status of shared, refused or unavailable."};
  if (status !== "shared") return {status, latitude: null, longitude: null, accuracy: null};
  if (!coordinate(body.latitude, 90) || !coordinate(body.longitude, 180)) return {error: "Location coordinates are not valid."};
  const accuracy = typeof body.accuracy === "number" && Number.isFinite(body.accuracy) && body.accuracy >= 0
    ? Math.min(Math.round(body.accuracy), 10000000) : null;
  const round = value => Math.round(value * 1e6) / 1e6;
  return {status, latitude: round(body.latitude), longitude: round(body.longitude), accuracy};
}

/** On only when the App Service setting SIGN_IN_LOCATION_REQUIRED is "1" (on hold otherwise). */
export function signInLocationRequired(env = process.env) {
  return String(env?.SIGN_IN_LOCATION_REQUIRED ?? "0").trim() === "1";
}

/** Whether this signed-in user must share a location before the app opens. */
export function signInLocationRequiredFor(session, env = process.env) {
  return signInLocationBlocks({...session, locationStatus: ""}, {env});
}

/** Default machine logins plus SIGN_IN_LOCATION_EXCEPTIONS (comma-separated logins). */
export function signInLocationExceptions(env = process.env) {
  return new Set([...DEFAULT_EXCEPTIONS, ...String(env?.SIGN_IN_LOCATION_EXCEPTIONS || "").split(",")]
    .map(login => login.trim().toLowerCase()).filter(Boolean));
}

export function requestRoute(req = {}) {
  return String(req.originalUrl || req.url || req.path || "").split("?")[0].replace(/\/+$/, "") || "/";
}

/** True when this request must wait until the session has shared (or cannot share) its location. */
export function signInLocationBlocks(session, {route = "", env = process.env, machine = false} = {}) {
  if (!session || machine || !signInLocationRequired(env)) return false;
  if (ALWAYS_OPEN.has(route)) return false;
  if (["shared", "unavailable"].includes(String(session.locationStatus || ""))) return false;
  return !signInLocationExceptions(env).has(String(session.login || "").trim().toLowerCase());
}

/**
 * Session guards call this right after the session is read. The answer lives on the
 * sign-in's login history row and is read once per sign-in: a sign-in that has been
 * let in is remembered, so later requests cost nothing. It answers 428 (never 401,
 * which would sign the user out) and returns true when the request must stop. Any
 * failure to read lets the request through: a lookup problem must never lock
 * everyone out.
 */
export function createSignInLocationGuard(pool, {env = process.env, cacheLimit = 20000, log = console} = {}) {
  const open = new Set();
  return async function signInLocationGuard(req, res, session, {machine = false} = {}) {
    if (!signInLocationBlocks(session, {route: requestRoute(req), env, machine})) return false;
    const sessionId = String(session?.sessionId || "").trim();
    if (!sessionId || open.has(sessionId)) return false;
    let status;
    try {
      const {rows} = await pool.query(SIGN_IN_LOCATION_STATUS_SQL, [sessionId]);
      status = rows.length ? String(rows[0].status || "") : null;
    } catch (error) {
      log?.error?.("Sign-in location could not be checked:", error.message);
      return false;
    }
    // No history row: nothing can be recorded for this sign-in, so it is not held.
    if (status === null) return false;
    if (status === "shared" || status === "unavailable") {
      if (open.size >= cacheLimit) open.clear();
      open.add(sessionId);
      return false;
    }
    res.status(428).json({error: SIGN_IN_LOCATION_REQUIRED_MESSAGE, code: SIGN_IN_LOCATION_REQUIRED_CODE});
    return true;
  };
}

/** Whether the app may open after this answer. */
export function signInLocationAccepted(status, session, env = process.env) {
  return !signInLocationBlocks({...session, locationStatus: status}, {env});
}

export const SIGN_IN_LOCATION_STATUS_SQL = "SELECT location_status AS status FROM user_login_history WHERE session_id=$1";

// The login history keeps the first shared position; until then the latest answer is shown.
export const SIGN_IN_LOCATION_UPDATE_SQL = `UPDATE user_login_history
  SET location_status=$2::text,location_latitude=$3,location_longitude=$4,location_accuracy_m=$5,location_at=NOW()
  WHERE session_id=$1 AND location_status<>'shared'`;
