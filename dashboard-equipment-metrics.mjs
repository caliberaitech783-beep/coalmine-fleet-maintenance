import {canonicalSiteName, equipmentSiteName} from './site-location.mjs';

const normalize = (value) => String(value ?? "").trim().toLowerCase();

export function isVehicleRecord(record = {}) {
  return ["vehicle", "vehicles"].includes(normalize(record.category));
}

export function fleetAssetCounts(records = []) {
  const equipment = records.filter((record) => ["equipment", "equipments"].includes(normalize(record.category))).length;
  const vehicles = records.filter(isVehicleRecord).length;
  return { equipment, vehicles, total: records.length };
}

export function equipmentRoadStatus(record = {}) {
  const status = normalize(record.status).replaceAll("_", " ").replaceAll("-", " ");
  if (["operational", "on road", "onroad"].includes(status)) return "onroad";
  if (["idle", "idling"].includes(status)) return "idle";
  if (status === "off road"
    || status === "offroad"
    || status.includes("maintenance")
    || status.includes("breakdown")) return "offroad";
  return "unknown";
}

export function equipmentMetrics(records = []) {
  const operational = records.filter((record) => equipmentRoadStatus(record) === "onroad").length;
  const offRoad = records.filter((record) => equipmentRoadStatus(record) === "offroad").length;
  const idle = records.filter((record) => equipmentRoadStatus(record) === "idle").length;
  return {
    total: records.length,
    onRoad: operational,
    offRoad,
    idle,
    unknown: records.length - operational - offRoad - idle,
    availability: records.length
      ? Math.round((operational / records.length) * 100)
      : 0,
  };
}

const identityValue = (value) => normalize(value).replace(/[^\p{L}\p{N}]+/gu, "");
const missingIdentityValues = new Set(["na", "notavailable", "notapplicable", "unknown", "none", "null"]);
const serialIdentityValues = (record = {}) => [
  record.manufacturerSerialNo,
  record.chassisNo,
  record.chassis,
].map(identityValue).filter((value) => value && !missingIdentityValues.has(value));
const doorIdentityValues = (record = {}) => [
  record.door,
  record.reg,
  record.registration,
].map(identityValue).filter(Boolean);
const overlaps = (left, right) => left.some((value) => right.includes(value));

function fleetIdentity(record = {}) {
  const requestSite = [record.site, record.currentLocation, record.location]
    .map((value) => String(value ?? "").trim()).find(Boolean) || "";
  return {
    requestSite: canonicalSiteName(requestSite),
    assetSite: canonicalSiteName(equipmentSiteName(record)),
    serials: serialIdentityValues(record),
    doors: doorIdentityValues(record),
    name: identityValue(record.equipmentName),
    requestedName: identityValue(record.equipmentName || record.equipment),
    group: identityValue(record.equipmentGroup),
    groups: new Set([record.equipment, record.equipmentGroup, record.group, record.itemName, record.category].map(identityValue).filter(Boolean)),
  };
}

const compatibleSites = (source, target) => !source.requestSite || !target.assetSite || source.requestSite === target.assetSite;
const individualNameMatches = (source, target) => Boolean(source.requestedName
  && source.requestedName === target.name
  && !target.groups.has(source.requestedName)
  && source.group !== source.requestedName);

function identitiesMatch(source, target) {
  if (!compatibleSites(source, target)) return false;
  // Strong identifiers outrank reused door numbers or display labels. Keep
  // identifier types separate: a door number is not another asset's chassis.
  if (source.serials.length && target.serials.length) return overlaps(source.serials, target.serials);
  if (overlaps(source.doors, target.doors)) return true;
  if ((source.serials.length || source.doors.length) && (target.serials.length || target.doors.length)) return false;
  return individualNameMatches(source, target);
}

function fleetAssetMatcher() {
  // Scope the cache to one calculation, so object edits cannot leave stale
  // fleet statuses behind and shared names/sites are normalized only once.
  const cache=new Map();
  const identity=record=>{
    if(!cache.has(record))cache.set(record,fleetIdentity(record));
    return cache.get(record);
  };
  return (request={},equipment={})=>{
    return identitiesMatch(identity(request),identity(equipment));
  };
}

// Build once per snapshot. Candidates are indexes so even repeated/duplicate
// master rows remain separate records rather than being silently deduplicated.
export function createFleetAssetResolver(records = []) {
  const identities = records.map(fleetIdentity);
  const serialIndex = new Map(), doorIndex = new Map(), nameIndex = new Map();
  const indexValue = (index, value, rowIndex) => {
    if (!value) return;
    if (!index.has(value)) index.set(value, new Set());
    index.get(value).add(rowIndex);
  };
  identities.forEach((identity, rowIndex) => {
    identity.serials.forEach((value) => indexValue(serialIndex, value, rowIndex));
    identity.doors.forEach((value) => indexValue(doorIndex, value, rowIndex));
    indexValue(nameIndex, identity.name, rowIndex);
  });
  const indexedRows = (index, values) => new Set(values.flatMap((value) => [...(index.get(value) || [])]));
  const result = (indexes, reason = "ambiguous") => ({
    assetIndex: indexes.length === 1 && reason === "matched" ? indexes[0] : null,
    candidateIndexes: indexes,
    reason,
  });
  return (request = {}, { allowTransferred = false } = {}) => {
    const source = fleetIdentity(request);
    const strong = [...indexedRows(serialIndex, source.serials)];
    const sameSiteStrong = strong.filter((index) => compatibleSites(source, identities[index]));
    if (sameSiteStrong.length) return result(sameSiteStrong, sameSiteStrong.length === 1 ? "matched" : "ambiguous");
    // Only a globally unique chassis/serial can carry current availability to
    // a new master location. Request history and scope remain unchanged.
    if (allowTransferred && strong.length) return result(strong, strong.length === 1 ? "matched" : "ambiguous");
    const related = new Set([
      ...indexedRows(doorIndex, source.doors),
      ...[...(nameIndex.get(source.requestedName) || [])].filter((index) => individualNameMatches(source, identities[index])),
    ]);
    const sameSite = [...related].filter((index) => compatibleSites(source, identities[index]));
    const matched = sameSite.filter((index) => identitiesMatch(source, identities[index]));
    if (matched.length) return result(matched, matched.length === 1 ? "matched" : "ambiguous");
    // A known door/name with contradictory strong identity needs review. It
    // must not be guessed off-road or silently presented as confidently free.
    const conflicting = sameSite.filter((index) => source.serials.length && identities[index].serials.length
      && !overlaps(source.serials, identities[index].serials));
    return result(conflicting, conflicting.length ? "conflicting" : "unmatched");
  };
}

function uniqueFleetAsset(records, request, matches) {
  let match = null;
  for (const record of records) {
    if (!matches(request, record)) continue;
    if (match !== null) return null;
    match = record;
  }
  return match;
}

// Enrichment/drilldowns must never pick an arbitrary record from shared names
// or reused identifiers. An ambiguous match needs review, not a guessed merge.
export function findFleetAssetForRequest(records = [], request = {}) {
  return uniqueFleetAsset(records, request, fleetAssetMatcher());
}

function matchingRoadStatus(record, requests, matches) {
  if (["onroad", "offroad", "idle", "unknown"].includes(record.dashboardRoadStatus)) return record.dashboardRoadStatus;
  const matchingRequests = requests.filter((request) =>
    normalize(request.status) !== "closed" && matches(request, record));
  if (matchingRequests.some((request) => !["ideal", "idle"].includes(normalize(request.status)))) return "offroad";
  if (matchingRequests.some((request) => ["ideal", "idle"].includes(normalize(request.status)))) return "idle";
  // Live BDMS availability follows the request lifecycle, not a stale master
  // snapshot. Keep equipmentRoadStatus/equipmentMetrics for snapshot consumers.
  return "onroad";
}

export function liveEquipmentRoadStatus(record = {}, requests = []) {
  return matchingRoadStatus(record,requests,fleetAssetMatcher());
}

export function liveEquipmentMetrics(records = [], requests = []) {
  const matches=fleetAssetMatcher();
  const statuses = records.map((record) => matchingRoadStatus(record, requests, matches));
  const onRoad = statuses.filter((status) => status === "onroad").length;
  const offRoad = statuses.filter((status) => status === "offroad").length;
  const idle = statuses.filter((status) => status === "idle").length;
  return {
    total: records.length,
    onRoad,
    offRoad,
    idle,
    unknown: records.length - onRoad - offRoad - idle,
    availability: records.length ? Math.round((onRoad / records.length) * 100) : 0,
  };
}

export function fleetChartCounts(records = [], requests = []) {
  const matches=fleetAssetMatcher();
  const activeBreakdownRecords = records.filter((record) => matchingRoadStatus(record, requests, matches) === "offroad");
  return {
    ...fleetAssetCounts(records),
    breakdown: fleetAssetCounts(activeBreakdownRecords),
  };
}

export function fleetBreakdownCaseCounts(records = [], requests = []) {
  const matches=fleetAssetMatcher();
  const openCases = requests.filter((request) => normalize(request.status) !== "closed");
  const isVehicleCase = (request) => {
    const asset = uniqueFleetAsset(records, request, matches);
    if (asset) return isVehicleRecord(asset);
    return Boolean(normalize(request.reg || request.registration));
  };
  const vehicles = openCases.filter(isVehicleCase).length;
  return { equipment: openCases.length - vehicles, vehicles, total: openCases.length };
}

// Fleet lists show the same Status / Started / Days of breakdown columns as
// request lists: each asset carries its current (not closed) breakdown request,
// or its live road status when it has none.
const ROAD_STATUS_LABELS = { onroad: "On road", offroad: "Off road", idle: "Idle", unknown: "Status not set" };
export function fleetAssetRequestDetails(records = [], requests = []) {
  const matches = fleetAssetMatcher();
  const active = requests.filter((request) => normalize(request.status) !== "closed");
  return records.map((record) => {
    const current = active.filter((request) => matches(request, record))
      .sort((left, right) => String(left.start || "").localeCompare(String(right.start || "")))[0];
    const requestStatus = current
      ? (String(current.verifiedAt || "").trim() ? "Verified" : String(current.status || "").trim() || "Open")
      : ROAD_STATUS_LABELS[matchingRoadStatus(record, requests, matches)] || ROAD_STATUS_LABELS.unknown;
    return {
      ...record,
      requestReference: current ? String(current.ref || current.reference || "") : "",
      requestStatus,
      requestStart: current?.start || "—",
      requestClosed: "—",
    };
  });
}
