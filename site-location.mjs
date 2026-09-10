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

export function userSessionLocationName(user = {}, roleLabel = "") {
  const accessLevel = firstSiteValue(roleLabel, user?.adminLevel, user?.permissions?.adminLevel).toLowerCase();
  const designation = [user?.designation, user?.role, user?.assignedRole, user?.userGroup, user?.department, user?.managerRole]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
  if (["admin", "super admin"].includes(accessLevel) || designation.includes("director")) return "All locations";

  const assignedSite = assignedUserSiteName(user);
  if (assignedSite) return assignedSite;

  const managerSites = (Array.isArray(user?.managerSites) ? user.managerSites : String(user?.managerSites ?? "").split("|"))
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (managerSites.length) return managerSites.join(" | ");

  const region = firstSiteValue(user?.managerRegion, user?.region);
  if (region && region.toLowerCase() !== "all") return `${region} region`;

  return region.toLowerCase() === "all" ? "All locations" : "Not assigned";
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
