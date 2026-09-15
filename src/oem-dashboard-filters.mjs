import { canonicalSiteName, recordBelongsToSite } from "../site-location.mjs";

const siteName = site => typeof site === "string" ? site : site.name;

// Chart clicks change the same filters the user can edit in the header.
export function oemFiltersForSelection(current, selection, regions) {
  const next = { ...current };
  if (selection.site) {
    const region = regions.find(region => region.sites.some(site => recordBelongsToSite({ site: selection.site }, siteName(site))));
    next.region = region?.code || "all";
    next.site = region?.sites.map(siteName).find(site => recordBelongsToSite({ site: selection.site }, site)) || selection.site;
  }
  if (selection.oem) next.oem = selection.oem;
  return next;
}

export function oemRowsForLocation(rows, region, site, regions) {
  if (site !== "all") return rows.filter(row => recordBelongsToSite({ site: row.site }, site));
  if (region === "all") return rows;
  const sites = regions.find(item => item.code === region)?.sites || [];
  return rows.filter(row => sites.some(site => recordBelongsToSite({ site: row.site }, siteName(site))));
}

// One section per canonical site, ordered WCL/NCL as in the chart. Unknown
// authorized locations remain visible instead of being merged or discarded.
export function groupOemRecordsBySite(records, regions) {
  const groups = regions.flatMap(region => region.sites.map(site => ({
    site: siteName(site), region: region.code, records: [],
  })));
  for (const record of records) {
    const site = record.requestSite || record.currentLocation || record.location || record.site || "Site not specified";
    let group = groups.find(group => canonicalSiteName(group.site) === canonicalSiteName(site));
    if (!group) { group = { site, region: "Other sites", records: [] }; groups.push(group); }
    group.records.push(record);
  }
  return groups.filter(group => group.records.length);
}
