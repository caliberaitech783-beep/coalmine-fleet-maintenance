const clean = (value) => String(value ?? "").trim();
const normalize = (value) => clean(value).toLowerCase().replace(/\s+/g, " ");

function requestTime(request = {}) {
  const value = clean(request.closedAt || request.start || request.verifiedAt).replace(" ", "T");
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function vehicleHistoryKey(request = {}) {
  const references = [
    ["door", request.reportDoor || request.door],
    ["chassis", request.chassis || request.manufacturerSerialNo],
    ["registration", request.reg || request.registrationNumber],
  ];
  const match = references.find(([, value]) => normalize(value));
  return match ? `${match[0]}:${normalize(match[1])}` : "";
}

export function vehicleRepairHistoryRows(requests = [], vehicle = {}) {
  const targetKey = typeof vehicle === "string" ? vehicle : vehicleHistoryKey(vehicle);
  if (!targetKey) return [];
  return requests
    .filter((request) => vehicleHistoryKey(request) === targetKey)
    .sort((left, right) => requestTime(right) - requestTime(left));
}

export function vehicleRepairHistoryOptions(requests = []) {
  const vehicles = new Map();
  for (const request of [...requests].sort((left, right) => requestTime(right) - requestTime(left))) {
    const key = vehicleHistoryKey(request);
    if (!key || vehicles.has(key)) continue;
    const door = clean(request.reportDoor || request.door);
    const equipment = clean(request.reportEquipment || request.equipment || request.equipmentGroup);
    const model = clean(request.reportModel || request.model);
    vehicles.set(key, {
      key,
      door,
      equipment,
      model,
      label: [door, equipment, model].filter(Boolean).join(" · ") || key.replace(/^[^:]+:/, ""),
    });
  }
  return [...vehicles.values()].sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: "base" }));
}

export function latestCompletedVehicleRepair(requests = [], vehicle = {}) {
  return vehicleRepairHistoryRows(requests, vehicle).find((request) =>
    normalize(request.status) === "closed" || Boolean(clean(request.closedAt) && clean(request.maintenanceWork)),
  ) || null;
}
