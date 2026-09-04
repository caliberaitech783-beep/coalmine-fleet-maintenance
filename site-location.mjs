const SITE_ALIASES = new Map([
  ["sasti ii", "sasti ob"],
  ["sasti", "sasti ob"],
  ["majri", "majri ob"],
  ["majri ii", "majri ob"],
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
  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/\(\s*2nd\s*\)/g, " 2nd")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return SITE_ALIASES.get(normalized) || normalized;
}

export function recordBelongsToSite(record, site) {
  return (
    canonicalSiteName(record?.currentLocation || record?.location || record?.site) ===
    canonicalSiteName(site)
  );
}

export function recordsForSite(records = [], site = "") {
  const selectedSite = canonicalSiteName(site);
  if (!selectedSite) return [];
  return records.filter((record) => recordBelongsToSite(record, selectedSite));
}
