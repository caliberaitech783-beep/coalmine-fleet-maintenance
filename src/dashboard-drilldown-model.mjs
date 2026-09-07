import { recordBelongsToSite } from "../site-location.mjs";

export const equipmentGroupLabel = (record = {}) => String(record.group || record.equipmentGroup || record.itemName || record.category || "Unclassified").trim() || "Unclassified";
export const equipmentCategoryLabel = (record = {}) => ["vehicle", "vehicles"].includes(String(record.category || "").trim().toLowerCase())
  ? "Total vehicles"
  : ["equipment", "equipments"].includes(String(record.category || "").trim().toLowerCase()) ? "Total equipment" : "Unclassified";
export const equipmentMachineLabel = (record = {}) => String(record.door || record.registration || record.reg || record.manufacturerSerialNo || record.chassisNo || record.equipmentName || "Unidentified").trim() || "Unidentified";

const filterOrder = ["region", "site", "category", "group", "machine"];
const atSite = (record, site) => recordBelongsToSite(record.requestSite ? { site: record.requestSite } : record, site);
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

// Input rows already carry the clicked chart's scope and the user's access scope.
export function drilldownView(rows = [], regions = [], filters = {}) {
  const regionOptions = regions.filter(({ code }) => ["NCL", "WCL"].includes(code)).map((region) => ({
    ...region,
    rows: rows.filter((record) => region.sites.some((site) => atSite(record, site))),
  }));
  const selectedRegion = regionOptions.find(({ code }) => code === filters.region)
    || regionOptions.find(({ rows: regionRows }) => regionRows.length)
    || regionOptions[0];
  const selection = { region: selectedRegion?.code || "", site: "", category: "", group: "", machine: "" };
  let filteredRows = selectedRegion?.rows || [];
  const regionTotal = filteredRows.length;
  const siteOptions = (selectedRegion?.sites || []).map((value) => ({ value, count: filteredRows.filter((record) => atSite(record, value)).length })).filter(({ count }) => count > 0);
  const options = { site: siteOptions };
  let parentChanged = Boolean(filters.region && filters.region !== selection.region);
  for (const [name, labelOf] of [["site", null], ["category", equipmentCategoryLabel], ["group", equipmentGroupLabel], ["machine", equipmentMachineLabel]]) {
    if (labelOf) options[name] = optionsFor(filteredRows, labelOf);
    const requested = parentChanged ? "" : filters[name] || "";
    const valid = options[name].some(({ value }) => value === requested);
    selection[name] = valid ? requested : "";
    if (requested && !valid) parentChanged = true;
    if (selection[name]) filteredRows = filteredRows.filter((record) => name === "site" ? atSite(record, selection.site) : labelOf(record) === selection[name]);
  }
  return { regions: regionOptions, selection, options, rows: filteredRows, regionTotal };
}
