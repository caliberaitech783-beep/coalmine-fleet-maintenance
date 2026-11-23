// Approximate coordinates of each site and of the Nagpur office. The sign-in location names the nearest of these
// (src/sign-in-location.mjs). They used to live with the temperature chip, which the owner removed on 23 Nov 2026.

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
