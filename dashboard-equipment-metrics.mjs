const normalize = (value) => String(value ?? "").trim().toLowerCase();

const vehicleWords = [
  "vehicle", "truck", "dumper", "tipper", "tanker", "bus", "ambulance",
  "jeep", "car", "pickup", "tractor", "trailer",
];

export function isVehicleRecord(record = {}) {
  const classification = [
    record.group,
    record.category,
    record.itemName,
    record.equipmentName,
  ].map(normalize).join(" ");
  return Boolean(normalize(record.reg) || normalize(record.chassisNo))
    || vehicleWords.some((word) => new RegExp(`\\b${word}s?\\b`, "i").test(classification));
}

export function fleetAssetCounts(records = []) {
  const vehicles = records.filter(isVehicleRecord).length;
  return {
    equipment: records.length - vehicles,
    vehicles,
    total: records.length,
  };
}

export function equipmentRoadStatus(record = {}) {
  const status = normalize(record.status).replaceAll("_", " ").replaceAll("-", " ");
  if (["operational", "on road", "onroad"].includes(status)) return "onroad";
  if (status === "off road"
    || status === "offroad"
    || status.includes("maintenance")
    || status.includes("breakdown")) return "offroad";
  return "unknown";
}

export function equipmentMetrics(records = []) {
  const operational = records.filter((record) => equipmentRoadStatus(record) === "onroad").length;
  const offRoad = records.filter((record) => equipmentRoadStatus(record) === "offroad").length;
  return {
    total: records.length,
    onRoad: operational,
    offRoad,
    availability: records.length
      ? Math.round((operational / records.length) * 100)
      : 0,
  };
}
