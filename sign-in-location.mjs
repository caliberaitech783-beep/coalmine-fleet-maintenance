// Location captured by the browser right after a sign-in. Sign-in never depends
// on it: a refusal is stored as "refused" so administrators can see it.
export const SIGN_IN_LOCATION_STATUSES = Object.freeze(["shared", "refused", "unavailable"]);

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

// The first shared position of a session is kept. A refusal or "unavailable"
// is only written while nothing is recorded, and is replaced by a later share.
export const SIGN_IN_LOCATION_UPDATE_SQL = `UPDATE user_login_history
  SET location_status=$2::text,location_latitude=$3,location_longitude=$4,location_accuracy_m=$5,location_at=NOW()
  WHERE session_id=$1 AND location_status<>'shared' AND ($2::text='shared' OR location_status='')`;
