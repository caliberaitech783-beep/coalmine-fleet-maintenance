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
