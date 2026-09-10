const SITE_ALIASES = new Map([
  ["sasti ii", "sasti ob"],
  ["sasti", "sasti ob"],
  ["majri", "majri ob"],
  ["majri ii", "majri ob"],
  ["majri o b", "majri ob"],
  ["dhoptala ii", "dhoptala ob 2nd"],
  ["dhoptala ob", "dhoptala ob 2nd"],
  ["gauri pauni", "gauri pauni ob 2nd"],
  ["gouri pouni", "gauri pauni ob 2nd"],
  ["gouri pouni ob 2nd", "gauri pauni ob 2nd"],
  ["lalpeth", "lalpeth ob"],
  ["lalpeth ii", "lalpeth ob"],
  ["jayant", "jayant ob"],
  ["dudhichua west", "dudhichua ob"],
  ["dudhichua east", "dudhichua east ob"],
]);

export function canonicalSiteName(value = "") {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\(\s*2nd\s*\)/g, " 2nd")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return SITE_ALIASES.get(normalized) || normalized;
}

const firstSiteValue = (...values) => values.map((value) => String(value ?? "").trim()).find(Boolean) || "";

// Equipment follows its current master location. User assignment is a separate,
// site-first concept; neither helper changes the stored source fields.
export function equipmentSiteName(record = {}) {
  return firstSiteValue(record?.currentLocation, record?.location, record?.site);
}

export function assignedUserSiteName(user = {}) {
  return firstSiteValue(user?.site, user?.location, user?.currentLocation);
}

export function recordBelongsToSite(record, site) {
  const selectedSite = canonicalSiteName(site);
  return Boolean(selectedSite) && canonicalSiteName(equipmentSiteName(record)) === selectedSite;
}

export function recordsForSite(records = [], site = "") {
  const selectedSite = canonicalSiteName(site);
  if (!selectedSite) return [];
  return records.filter((record) => recordBelongsToSite(record, selectedSite));
}
