import {canonicalSiteName} from './site-location.mjs';

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

const strongIdentityValues = (record = {}) => [
  record.manufacturerSerialNo,
  record.chassisNo,
  record.chassis,
  record.door,
  record.reg,
  record.registration,
].map(normalize).filter(Boolean);

function fleetAssetMatcher() {
  // Scope the cache to one calculation, so object edits cannot leave stale
  // fleet statuses behind and shared names/sites are normalized only once.
  const cache=new Map();
  const identity=record=>{
    if(!cache.has(record))cache.set(record,{
      requestSite:canonicalSiteName(record.site || record.currentLocation || record.location),
      assetSite:canonicalSiteName(record.currentLocation || record.location || record.site),
      values:strongIdentityValues(record),
      name:normalize(record.equipmentName),
      requestedName:normalize(record.equipmentName || record.equipment),
      group:normalize(record.equipmentGroup),
      groups:new Set([record.equipment,record.equipmentGroup,record.group,record.itemName,record.category].map(normalize).filter(Boolean)),
    });
    return cache.get(record);
  };
  return (request={},equipment={})=>{
    const source=identity(request),target=identity(equipment);
    if(source.requestSite && target.assetSite && source.requestSite!==target.assetSite)return false;
    if(source.values.some(value=>target.values.includes(value)))return true;
    // A shared model/group/name must not override a different door or chassis.
    if(source.values.length && target.values.length)return false;
    if(target.groups.has(source.requestedName)||source.group===source.requestedName)return false;
    // Legacy rows may identify an individual vehicle by its displayed name.
    // Equipment Master's `equipment` field is a group, not an asset identifier.
    return Boolean(source.requestedName && source.requestedName===target.name);
  };
}

function matchingRoadStatus(record, requests, matches) {
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
  const activeBreakdownRecords = records.filter((record) => requests.some((request) => {
    const status = normalize(request.status);
    return status !== "closed" && !["idle", "ideal"].includes(status) && matches(request, record);
  }));
  return {
    ...fleetAssetCounts(records),
    breakdown: fleetAssetCounts(activeBreakdownRecords),
  };
}

export function fleetBreakdownCaseCounts(records = [], requests = []) {
  const matches=fleetAssetMatcher();
  const openCases = requests.filter((request) => normalize(request.status) !== "closed");
  const isVehicleCase = (request) => {
    const asset = records.find((record) => matches(request, record));
    if (asset) return isVehicleRecord(asset);
    return Boolean(normalize(request.reg || request.registration));
  };
  const vehicles = openCases.filter(isVehicleCase).length;
  return { equipment: openCases.length - vehicles, vehicles, total: openCases.length };
}
