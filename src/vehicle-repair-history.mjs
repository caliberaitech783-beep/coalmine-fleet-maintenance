import { canonicalSiteName } from "../site-location.mjs";

const clean = (value) => String(value ?? "").trim();
const normalize = (value) => clean(value).toLowerCase().replace(/\s+/g, " ");

function requestTime(request = {}) {
  const value = clean(request.closedAt || request.start || request.verifiedAt).replace(" ", "T");
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function breakdownTime(request = {}) {
  const raw = clean(request.start || request.closedAt || request.verifiedAt || request.transferDate || request.createdAt).replace(/\s*(?:·|Â·)\s*/, " ");
  const direct = Date.parse(raw.replace(" ", "T"));
  if (Number.isFinite(direct)) return direct;
  const indianDate = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})(?:\s+(.*))?$/);
  if (!indianDate) return 0;
  const parsed = Date.parse(`${indianDate[3]}-${indianDate[2]}-${indianDate[1]}T${indianDate[4] || "00:00"}`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function breakdownMonth(request = {}) {
  const raw = clean(request.start || request.closedAt || request.verifiedAt || request.createdAt);
  const direct = raw.match(/^(\d{4}-\d{2})/);
  if (direct) return direct[1];
  const indian = raw.match(/^\d{2}[-/]\d{2}[-/](\d{4})/);
  if (indian) {
    const parts = raw.slice(0, 10).split(/[-/]/);
    return `${indian[1]}-${parts[1]}`;
  }
  const timestamp = breakdownTime(request);
  return timestamp ? new Date(timestamp).toISOString().slice(0, 7) : "";
}

function intervalLabel(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "";
  const totalMinutes = Math.round(milliseconds / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours) parts.push(`${hours} hr${hours === 1 ? "" : "s"}`);
  if (!days && minutes) parts.push(`${minutes} min`);
  return parts.join(" ") || "Less than 1 min";
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
    ["closed", "verified"].includes(normalize(request.status)) || Boolean(clean(request.closedAt)),
  ) || null;
}

export function vehicleBreakdownHistoryRows(requests = [], vehicle = {}) {
  const chronological = vehicleRepairHistoryRows(requests, vehicle)
    .map((request) => ({ request, timestamp: breakdownTime(request) }))
    .sort((left, right) => left.timestamp - right.timestamp);
  return chronological.map(({ request, timestamp }, index) => {
    const previousTimestamp = chronological[index - 1]?.timestamp || 0;
    const gapMilliseconds = index && timestamp && previousTimestamp ? timestamp - previousTimestamp : null;
    return {
      ...request,
      breakdownSequence: index + 1,
      gapMilliseconds,
      timeSincePreviousBreakdown: index ? intervalLabel(gapMilliseconds) : "",
    };
  });
}

function latestRequestForVehicle(requests = [], vehicle = {}) {
  return vehicleBreakdownHistoryRows(requests, vehicle).at(-1) || null;
}

function transferMatchesVehicle(transfer = {}, vehicle = {}) {
  const values = [vehicle.reportDoor, vehicle.door, vehicle.reg, vehicle.registrationNumber, vehicle.equipmentName, vehicle.reportEquipment]
    .map(normalize).filter(Boolean);
  return [transfer.door, transfer.reg, transfer.registrationNumber, transfer.equipment, transfer.equipmentName, transfer.chassisNo, transfer.manufacturerSerialNo]
    .map(normalize).filter(Boolean).some((value) => values.includes(value));
}

export function vehicleFleetRows(equipmentRecords = [], requests = [], transfers = []) {
  const vehicles = new Map();
  const add = (record, source = "master") => {
    const key = vehicleHistoryKey(record);
    if (!key) return;
    const existing = vehicles.get(key) || {};
    vehicles.set(key, source === "master" ? { ...existing, ...record } : { ...record, ...existing });
  };
  equipmentRecords.forEach((record) => add(record, "master"));
  requests.forEach((record) => add(record, "request"));
  return [...vehicles.entries()].map(([vehicleKey, vehicle]) => {
    const history = vehicleRepairHistoryRows(requests, vehicleKey);
    const latest = latestRequestForVehicle(requests, vehicleKey) || {};
    const latestTransfer = transfers
      .filter((transfer) => transferMatchesVehicle(transfer, { ...vehicle, ...latest }))
      .sort((left, right) => breakdownTime(right) - breakdownTime(left))[0] || {};
    const latestDriver = history.find((request) => clean(request.driverName || request.driver)) || {};
    const door = clean(vehicle.door || vehicle.reportDoor || latest.reportDoor || latest.door);
    return {
      ...vehicle,
      ...latest,
      vehicleKey,
      reportDoor: door,
      reportEquipment: clean(vehicle.equipmentName || vehicle.reportEquipment || latest.reportEquipment || latest.equipment || latest.equipmentGroup),
      reportMake: clean(vehicle.make || vehicle.reportMake || latest.reportMake || latest.make),
      reportModel: clean(vehicle.model || vehicle.modelNo || vehicle.reportModel || latest.reportModel || latest.model),
      reportSite: clean(vehicle.currentLocation || vehicle.location || vehicle.reportSite || latest.reportSite || latest.site || latestTransfer.destination),
      driverName: clean(latest.driverName || latest.driver || latestDriver.driverName || latestDriver.driver || latestTransfer.driver),
      registrationNumber: clean(vehicle.reg || vehicle.registrationNumber || latest.reg),
      chassisNumber: clean(vehicle.chassisNo || vehicle.manufacturerSerialNo || latest.chassis || latest.chassisNo),
      breakdownCount: history.length,
      latestBreakdownAt: latest.start || latest.closedAt || "",
    };
  }).sort((left, right) => left.reportDoor.localeCompare(right.reportDoor, undefined, { numeric: true, sensitivity: "base" }));
}

export function vehicleBreakdownSummaryRows(requests = [], { month = "", sites = null, site = "" } = {}) {
  const filtered = requests.filter((request) => {
    const requestMonth = breakdownMonth(request);
    const requestSite = canonicalSiteName(request.reportSite || request.site);
    const allowedSites = Array.isArray(sites) ? sites.map(canonicalSiteName) : null;
    return (!month || requestMonth === month)
      && (!allowedSites || allowedSites.includes(requestSite))
      && (!site || requestSite === canonicalSiteName(site));
  });
  const groups = new Map();
  for (const request of filtered) {
    const key = vehicleHistoryKey(request);
    if (!key) continue;
    const group = groups.get(key) || { vehicleKey: key, breakdowns: [] };
    group.breakdowns.push(request);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    group.breakdowns.sort((left, right) => breakdownTime(left) - breakdownTime(right));
    const latest = group.breakdowns.at(-1) || {};
    return {
      ...group,
      reportDoor: clean(latest.reportDoor || latest.door),
      reportEquipment: clean(latest.reportEquipment || latest.equipment || latest.equipmentGroup),
      reportSite: clean(latest.reportSite || latest.site),
      breakdownCount: group.breakdowns.length,
    };
  }).sort((left, right) => right.breakdownCount - left.breakdownCount || left.reportDoor.localeCompare(right.reportDoor, undefined, { numeric: true }));
}

function commonComplaint(history = []) {
  const complaints = new Map();
  for (const request of history) {
    const complaint = clean(request.complaint || request.category);
    const key = normalize(complaint);
    if (!key) continue;
    const current = complaints.get(key) || { label: complaint, count: 0 };
    current.count += 1;
    complaints.set(key, current);
  }
  return [...complaints.values()].sort((left, right) => right.count - left.count)[0] || { label: "", count: 0 };
}

export function vehicleCommonRemarkRows(equipmentRecords = [], requests = [], transfers = []) {
  return vehicleFleetRows(equipmentRecords, requests, transfers).map((vehicle) => {
    const history = vehicleRepairHistoryRows(requests, vehicle.vehicleKey);
    const latest = latestRequestForVehicle(requests, vehicle.vehicleKey) || {};
    const common = commonComplaint(history);
    const latestRemark = (latest.dailyRemarks || [])[0];
    const open = history.filter((request) => !["closed", "verified"].includes(normalize(request.status)) && !clean(request.closedAt)).length;
    const notice = !history.length
      ? "No breakdown recorded"
      : `${history.length} breakdown${history.length === 1 ? "" : "s"}${open ? ` · ${open} open` : " · all closed"}`;
    return {
      ...vehicle,
      driverName: clean(latest.driverName || latest.driver || vehicle.driverName),
      notice,
      remark: clean(latestRemark?.remark || latest.maintenanceWork || latest.idleReason || latest.status),
      breakdownReason: common.label,
      commonReasonCount: common.count,
      latestRequest: latest.ref || "",
    };
  });
}
