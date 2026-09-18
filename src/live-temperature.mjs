// Live outdoor temperature for the Help & Training dialog. The viewer's own
// position is used when the browser grants it; otherwise the assigned site's
// approximate coordinates; otherwise the WCL head office. Readings come from
// the free Open-Meteo service (no key, no account).

export const SITE_COORDINATES = Object.freeze({
  "sasti ob": { latitude: 19.78, longitude: 79.33, place: "Sasti, Chandrapur" },
  "majri ob": { latitude: 20.05, longitude: 79.06, place: "Majri, Chandrapur" },
  "dhoptala ob (2nd)": { latitude: 19.88, longitude: 79.15, place: "Dhoptala, Chandrapur" },
  "gauri pauni ob (2nd)": { latitude: 20.13, longitude: 79.37, place: "Gauri Pauni, Chandrapur" },
  "lalpeth ob": { latitude: 19.93, longitude: 79.32, place: "Lalpeth, Chandrapur" },
  "jayant ob": { latitude: 24.14, longitude: 82.65, place: "Jayant, Singrauli" },
  "dudhichua ob": { latitude: 24.17, longitude: 82.66, place: "Dudhichua, Singrauli" },
  "dudhichua east ob": { latitude: 24.18, longitude: 82.7, place: "Dudhichua East, Singrauli" },
});
export const DEFAULT_COORDINATES = Object.freeze({ latitude: 21.15, longitude: 79.09, place: "Nagpur" });
export const TEMPERATURE_REFRESH_MS = 10 * 60 * 1000;

const text = (value) => String(value ?? "").trim();

/** "(37°C) 98.6°F"; dashes while unknown. */
export function formatTemperature(celsius) {
  if (!Number.isFinite(celsius)) return "(--°C) --°F";
  const fahrenheit = celsius * 9 / 5 + 32;
  return `(${Math.round(celsius)}°C) ${fahrenheit.toFixed(1)}°F`;
}

/** Coordinates for an assigned site name (case-insensitive, first matching site in a list). */
export function coordinatesForSite(site) {
  const key = text(site).toLowerCase();
  if (!key) return null;
  if (SITE_COORDINATES[key]) return SITE_COORDINATES[key];
  const found = Object.keys(SITE_COORDINATES).find((name) => key.includes(name) || name.includes(key));
  return found ? SITE_COORDINATES[found] : null;
}

export function temperatureUrl({ latitude, longitude }) {
  return `https://api.open-meteo.com/v1/forecast?latitude=${Number(latitude).toFixed(3)}&longitude=${Number(longitude).toFixed(3)}&current=temperature_2m&timezone=Asia%2FKolkata`;
}

/** Current temperature in °C at the coordinates. Throws on any failure. */
export async function fetchLiveTemperature({ latitude, longitude, fetchImpl = globalThis.fetch, signal } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch unavailable");
  const response = await fetchImpl(temperatureUrl({ latitude, longitude }), { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`Weather service returned ${response.status}`);
  const data = await response.json();
  const celsius = Number(data?.current?.temperature_2m);
  if (!Number.isFinite(celsius)) throw new Error("No temperature in the weather response");
  return { celsius, at: text(data?.current?.time) };
}

/** The viewer's own position when the browser allows it, otherwise null (never rejects). */
export function locateViewer({ geolocation = globalThis.navigator?.geolocation, timeoutMs = 6000 } = {}) {
  return new Promise((resolve) => {
    if (!geolocation || typeof geolocation.getCurrentPosition !== "function") return resolve(null);
    try {
      geolocation.getCurrentPosition(
        (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, place: "your location" }),
        () => resolve(null),
        { timeout: timeoutMs, maximumAge: TEMPERATURE_REFRESH_MS },
      );
    } catch {
      resolve(null);
    }
  });
}

/** Viewer position, else the site's coordinates, else the default. */
export async function resolveTemperatureCoordinates(site, options = {}) {
  return (await locateViewer(options)) || coordinatesForSite(site) || DEFAULT_COORDINATES;
}
