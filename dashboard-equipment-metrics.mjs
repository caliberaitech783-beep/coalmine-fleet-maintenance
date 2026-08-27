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

const identityValues = (record = {}) => [
  record.manufacturerSerialNo,
  record.chassisNo,
  record.chassis,
  record.door,
  record.equipmentName,
  record.equipment,
  record.reg,
  record.registration,
].map(normalize).filter(Boolean);

function requestMatchesEquipment(request = {}, equipment = {}) {
  const equipmentValues = new Set(identityValues(equipment));
  return identityValues(request).some((value) => equipmentValues.has(value));
}

export function liveEquipmentRoadStatus(record = {}, requests = []) {
  const matchingRequests = requests.filter((request) =>
    normalize(request.status) !== "closed" && requestMatchesEquipment(request, record));
  if (matchingRequests.some((request) => !["ideal", "idle"].includes(normalize(request.status)))) return "offroad";
  if (matchingRequests.some((request) => ["ideal", "idle"].includes(normalize(request.status)))) return "idle";
  const storedStatus = equipmentRoadStatus(record);
  return storedStatus === "unknown" ? "onroad" : storedStatus;
}

export function liveEquipmentMetrics(records = [], requests = []) {
  const statuses = records.map((record) => liveEquipmentRoadStatus(record, requests));
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
