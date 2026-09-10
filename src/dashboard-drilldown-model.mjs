import { canonicalSiteName, equipmentSiteName, recordBelongsToSite } from "../site-location.mjs";
import { equipmentGroupValue, normalizeEquipmentGroup } from "../equipment-group.mjs";

export const equipmentGroupLabel = (record = {}) => equipmentGroupValue(record, normalizeEquipmentGroup(record.itemName || record.category) || "Unclassified");
export const equipmentCategoryLabel = (record = {}) => ["vehicle", "vehicles"].includes(String(record.category || "").trim().toLowerCase())
  ? "Total vehicles"
  : ["equipment", "equipments"].includes(String(record.category || "").trim().toLowerCase()) ? "Total equipment" : "Unclassified";
export const equipmentMachineLabel = (record = {}) => String(record.door || record.registration || record.reg || record.manufacturerSerialNo || record.chassisNo || record.equipmentName || "Unidentified").trim() || "Unidentified";

const filterOrder = ["region", "site", "category", "group", "machine"];
const recordSite = (record) => Object.hasOwn(record, "requestSite") ? String(record.requestSite || "").trim() : equipmentSiteName(record);
const atSite = (record, site) => recordBelongsToSite({ site: recordSite(record) }, site);
const optionsFor = (rows, labelOf) => {
  const counts = new Map();
  for (const row of rows) {
    const value = labelOf(row);
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true }));
};

export function changeDrilldownFilter(filters, name, value) {
  const index = filterOrder.indexOf(name);
  if (index < 0) return filters;
  return Object.fromEntries(filterOrder.map((field, position) => [field, position < index ? filters[field] || "" : position === index ? value : ""]));
}

// Only an explicitly access-scoped caller may retain rows outside the site catalogue.
// Region/site tabs classify that snapshot; they must not silently discard its records.
export function drilldownView(rows = [], regions = [], filters = {}, { rowsAreScoped = false } = {}) {
  const allowedRegions = regions.filter(({ code }) => ["NCL", "WCL"].includes(code));
  const siteLabels = new Map();
  for (const region of allowedRegions) for (const site of region.sites) {
    if (!siteLabels.has(canonicalSiteName(site))) siteLabels.set(canonicalSiteName(site), site);
  }
  const entries = rows.flatMap((record) => {
    const region = allowedRegions.find((region) => region.sites.some((site) => atSite(record, site)));
    if (!region && !rowsAreScoped) return [];
    const rawSite = recordSite(record);
    const key = canonicalSiteName(rawSite);
    if (!siteLabels.has(key)) siteLabels.set(key, rawSite || "Site not recorded");
    return [{ record, region: region?.code || "unmapped", site: siteLabels.get(key) }];
  });
  const regionOptions = allowedRegions.map((region) => ({
    ...region, label: region.code,
    rows: entries.filter((entry) => entry.region === region.code).map((entry) => entry.record),
  }));
  const unmapped = entries.filter((entry) => entry.region === "unmapped");
  if (unmapped.length) regionOptions.push({ code: "unmapped", label: "Other / unassigned", rows: unmapped.map((entry) => entry.record) });
  if (regionOptions.length) regionOptions.unshift({ code: "all", label: "All regions", rows: entries.map((entry) => entry.record) });
  const selectedRegion = regionOptions.find(({ code }) => code === filters.region)
    || regionOptions[0];
  const selection = { region: selectedRegion?.code || "", site: "", category: "", group: "", machine: "" };
  let filteredRows = selection.region === "all" ? entries : entries.filter((entry) => entry.region === selection.region);
  const regionTotal = filteredRows.length;
  const siteOptions = optionsFor(filteredRows, (entry) => entry.site);
  const options = { site: siteOptions };
  let parentChanged = Boolean(filters.region && filters.region !== selection.region);
  for (const [name, labelOf] of [["site", null], ["category", equipmentCategoryLabel], ["group", equipmentGroupLabel], ["machine", equipmentMachineLabel]]) {
    if (labelOf) options[name] = optionsFor(filteredRows, (entry) => labelOf(entry.record));
    const requested = parentChanged ? "" : filters[name] || "";
    const valid = options[name].some(({ value }) => value === requested);
    selection[name] = valid ? requested : "";
    if (requested && !valid) parentChanged = true;
    if (selection[name]) filteredRows = filteredRows.filter((entry) => name === "site" ? entry.site === selection.site : labelOf(entry.record) === selection[name]);
  }
  return { regions: regionOptions, selection, regionLabel: selectedRegion?.label || "Fleet", options, rows: filteredRows.map((entry) => entry.record), regionTotal };
}
