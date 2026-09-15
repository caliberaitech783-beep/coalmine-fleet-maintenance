import { createFleetAssetResolver, equipmentRoadStatus } from "../dashboard-equipment-metrics.mjs";
import { indiaDateTimeEpoch } from "../report-date-range.mjs";
import { parseReportTimestamp } from "../report-metrics.mjs";
import { recordBelongsToSite } from "../site-location.mjs";
import { requestStatusLabel } from "./request-status.mjs";

const text = (value) => String(value ?? "").trim();
const normalize = (value) => text(value).toLowerCase();
const idle = (request) => ["idle", "ideal"].includes(normalize(request.status));
export const OEM_COLORS = ["#522e90", "#c93e47", "#237d96", "#b55d13", "#39734c", "#a23578", "#5268bd", "#746042", "#146c68", "#9c3c25", "#7553a6", "#536d24", "#235ea8", "#b04065", "#62636a", "#866213", "#337345", "#9b427f", "#436273", "#7e4435", "#654fa0", "#256b80", "#886432", "#845069"];
export const oemLabel = (record = {}) => text(record.make) || text(record.oem) || "OEM not specified";

export function oemDateRangeError(from, to) {
  if ((from && !Number.isFinite(indiaDateTimeEpoch(from))) || (to && !Number.isFinite(indiaDateTimeEpoch(to)))) return "Choose valid dates.";
  return from && to && from > to ? "From date must be on or before To date." : "";
}

function requestInRange(request, from, to, now) {
  if (!from && !to) return normalize(request.status) !== "closed" && !idle(request);
  const start = parseReportTimestamp(request.start || request.startedAt || request.createdAt)?.getTime();
  const rangeStart = from ? indiaDateTimeEpoch(from) : -Infinity;
  const rangeEnd = to ? indiaDateTimeEpoch(`${to}T23:59:59.999`) : now;
  // An idle request stopped being a breakdown when maintenance was completed.
  const ended = normalize(request.status) === "closed" || idle(request);
  const end = ended ? parseReportTimestamp(idle(request) ? request.idealRequestedAt || request.idleRequestedAt || request.closedAt || request.idleAt : request.closedAt || request.completedAt)?.getTime() : Infinity;
  return Number.isFinite(start) && start <= Math.min(rangeEnd, now) && end > rangeStart && end > start;
}

// Build one chart row per asset. Requests are retained for the complete detail list.
export function buildOemBreakdownRows({ equipment = [], requests = [], from = "", to = "", now = Date.now() } = {}) {
  if (oemDateRangeError(from, to)) return [];
  const matches = new Map(equipment.map((record) => [record, []]));
  const resolveEquipment = createFleetAssetResolver(equipment);
  const unmatched = new Map();
  requests.forEach((request, index) => {
    // Use the production resolver so reused doors and contradictory chassis
    // numbers are handled exactly like the other fleet dashboards.
    const { assetIndex } = resolveEquipment(request, { allowTransferred: true });
    const record = assetIndex === null ? null : equipment[assetIndex];
    if (record) matches.get(record).push(request);
    else if (requestInRange(request, from, to, now)) {
      const key = request.chassis ? `chassis:${normalize(request.chassis)}` : request.reg ? `reg:${normalize(request.reg)}` : request.door ? `door:${normalize(request.door)}|site:${normalize(request.site || request.currentLocation || request.location)}` : `request-${request.ref || index}`;
      if (!unmatched.has(key)) unmatched.set(key, []);
      unmatched.get(key).push(request);
    }
  });
  const rows = [];
  const addRow = (record, matching, id) => {
    const oem = oemLabel(record);
    const site = text(record.currentLocation || record.location || record.site) || "Site not specified";
    const details = matching.length ? matching.map((request, index) => ({
      ...request,
      ref: request.ref || request.reference || `${id}-${index}`,
      make: oem,
      model: record.model || request.model || "",
      equipmentGroup: record.group || record.equipmentGroup || request.equipmentGroup || request.equipment,
      door: request.door || record.door || record.equipmentName,
      chassis: request.chassis || record.chassisNo || record.manufacturerSerialNo,
      site,
    })) : [{
      ref: `Asset ${record.equipmentName || record.door || record.id || id}`,
      equipment: record.equipmentName || record.door || "Unclassified equipment",
      equipmentGroup: record.group || record.equipmentGroup || record.itemName,
      door: record.door || record.equipmentName,
      make: oem, model: record.model, site,
      chassis: record.chassisNo || record.manufacturerSerialNo,
      status: "Off road", category: "—",
      complaint: "Off road in Equipment master; no linked active request.",
    }];
    rows.push({ id, oem, oemKey: normalize(oem), site, record, requests: details });
  };
  equipment.forEach((record, index) => {
    const history = matches.get(record);
    const matching = history.filter((request) => requestInRange(request, from, to, now));
    const masterOnly = !from && !to && (record.dashboardRoadStatus || equipmentRoadStatus(record)) === "offroad" && !history.some(idle);
    if (matching.length || masterOnly) addRow(record, matching, `equipment-${record.id ?? index}`);
  });
  unmatched.forEach((matching, key) => addRow(matching[0], matching, `unmatched-${key}`));
  return rows;
}

export function buildOemBreakdownChart({ rows = [], equipment = [], regions = [], oem = "all" } = {}) {
  const labels = new Map();
  [...equipment.map(oemLabel), ...rows.map((row) => row.oem)].forEach((label) => {
    if (!labels.has(normalize(label))) labels.set(normalize(label), label);
  });
  const oems = [...labels].sort((a, b) => a[1].localeCompare(b[1])).map(([key, label], index) => ({ key, label, color: OEM_COLORS[index] || `hsl(${(index * 137.508) % 360} 56% 36%)` }));
  const filteredRows = rows.filter((row) => oem === "all" || row.oemKey === oem);
  const siteGroups = regions.flatMap((region) => region.sites.map((site) => ({ region: region.code, name: typeof site === "string" ? site : site.name, rows: [] })));
  filteredRows.forEach((row) => {
    let site = siteGroups.find((group) => recordBelongsToSite({ site: row.site }, group.name));
    if (!site) {
      site = { region: "Other sites", name: row.site, rows: [] };
      siteGroups.push(site);
    }
    site.rows.push(row);
  });
  const sites = siteGroups.map((site) => ({
    ...site,
    total: site.rows.length,
    segments: oems.map((item) => ({ ...item, rows: site.rows.filter((row) => row.oemKey === item.key) })).filter((item) => item.rows.length),
  }));
  const maximum = Math.max(1, ...sites.map((site) => site.total));
  const step = Math.max(1, Math.ceil(maximum / 5));
  const axisMax = step * 5;
  return { rows: filteredRows, oems, selectedOem: oem, sites, axisMax, ticks: [5, 4, 3, 2, 1, 0].map((tick) => tick * step) };
}

export function selectOemBreakdownRows(rows, selection = {}) {
  return rows.filter((row) => (!selection.oem || row.oemKey === selection.oem) && (!selection.site || recordBelongsToSite({ site: row.site }, selection.site)));
}

// Capture the chart's selected rows at click time. Polling may update the chart,
// but it must not replace the list the user is inspecting.
export function createOemBreakdownSelection(chart, selection = {}) {
  const oem = selection.oem || (chart.selectedOem !== "all" ? chart.selectedOem : "");
  const rows = selectOemBreakdownRows(chart.rows, { ...selection, oem });
  const selected = chart.oems.find(item => item.key === oem);
  const records = rows.flatMap(row => row.requests.map((request, index) => ({
    ...row.record,
    id: `${row.id}:${index}`,
    make: row.oem,
    door: request.door || row.record.door,
    model: request.model || row.record.model,
    category: row.record.category || request.equipmentCategory,
    group: request.equipmentGroup || row.record.group,
    manufacturerSerialNo: request.chassis || row.record.manufacturerSerialNo || row.record.chassisNo,
    requestSite: row.site,
    requestReference: request.ref?.startsWith("Asset ") ? "" : request.ref || "",
    requestStatus: requestStatusLabel(request),
    requestStart: request.start || request.startedAt || request.createdAt || "",
    requestClosed: request.closedAt || request.completedAt || "",
    repairCategory: request.category || "—",
    requestDetails: request,
  })));
  return { ...selection, oem, rows, records, label: selected?.label || "All OEMs", color: selected?.color || "", regions: chart.sites.reduce((regions, site) => {
    let region = regions.find(item => item.code === site.region);
    if (!region) { region = { code: site.region, sites: [] }; regions.push(region); }
    region.sites.push(site.name);
    return regions;
  }, []) };
}
