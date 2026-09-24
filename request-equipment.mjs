import { equipmentGroupValue } from './equipment-group.mjs';
import { matchesSmartSearch } from './smart-search.mjs';
import { equipmentDoorNumber, createRequestDoorResolver } from './equipment-door.mjs';

function text(value) {
  return String(value ?? "").trim();
}

function equipmentReference(value) {
  return text(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

// Manager request lists can contain thousands of rows. Build the normalized
// Equipment Master indexes once for each immutable records snapshot instead
// of rescanning the full master for every request.
const requestEquipmentLookupCache = new WeakMap();
const emptyRequestEquipmentLookup = {
  references: new Map(),
  resolveDoor: (request) => request,
};

function requestEquipmentLookup(records = []) {
  if (!Array.isArray(records) || !records.length) return emptyRequestEquipmentLookup;
  const cached = requestEquipmentLookupCache.get(records);
  if (cached) return cached;
  const references = new Map();
  for (const record of records) {
    const details = requestEquipmentDetails(record);
    const keys = new Set([details.chassis, details.door, details.reg, details.equipment, record.manufacturerSerialNo]
      .map(equipmentReference)
      .filter(Boolean));
    for (const key of keys) {
      if (!references.has(key)) references.set(key, new Set());
      references.get(key).add(record);
    }
  }
  const lookup = { references, resolveDoor: createRequestDoorResolver(records) };
  requestEquipmentLookupCache.set(records, lookup);
  return lookup;
}

export function findRequestEquipment(records = [], selectedId = "") {
  const id = text(selectedId);
  if (!id) return null;
  return records.find((record) => text(record?.id) === id) || null;
}

export function requestEquipmentDetails(record = {}) {
  const equipment =
    text(record.equipmentName) ||
    text(record.itemName) ||
    text(record.category) ||
    text(record.door) ||
    text(record.reg) ||
    text(record.manufacturerSerialNo) ||
    (record.id != null ? `Equipment ${record.id}` : "");
  const reg = text(record.registration) || text(record.reg);
  const door = equipmentDoorNumber(record);
  return {
    equipment,
    group: equipmentGroupValue(record),
    door,
    reg,
    chassis: text(record.chassisNo) || text(record.chassis),
    make: text(record.make),
    model: text(record.model) || text(record.modelNo),
    site: text(record.currentLocation) || text(record.location),
  };
}

export function requestWithEquipmentMasterDetails(request = {}, records = []) {
  const lookup = requestEquipmentLookup(records);
  let equipment = null;
  for (const requestKey of [request.chassis, request.door, request.reg, request.equipment].map(equipmentReference).filter(Boolean)) {
    const matches = lookup.references.get(requestKey);
    if (matches?.size === 1) {
      equipment = matches.values().next().value;
      break;
    }
  }
  const details = requestEquipmentDetails(equipment || {});
  return {
    ...lookup.resolveDoor(request),
    make: details.make || text(request.make),
    model: details.model || text(request.model),
  };
}

export function requestEquipmentMeterType(record = {}) {
  return ["vehicle", "vehicles"].includes(text(record.category).toLowerCase()) ? "KMR" : "HMR";
}

export function requestMeterTypeForRequest(request = {}, records = []) {
  if (["KMR", "HMR"].includes(text(request.meterType).toUpperCase())) {
    return text(request.meterType).toUpperCase();
  }
  const requestKeys = [request.chassis, request.door, request.reg, request.equipment]
    .map((value) => text(value).toLowerCase())
    .filter(Boolean);
  const equipment = records.find((record) => {
    const details = requestEquipmentDetails(record);
    return [details.chassis, details.door, details.reg, details.equipment]
      .map((value) => text(value).toLowerCase())
      .some((value) => value && requestKeys.includes(value));
  });
  return requestEquipmentMeterType(equipment || {});
}

export function requestMeterTypesForRequest(request = {}, records = []) {
  const keys = [request.chassis, request.door, request.reg].map((value) => text(value).toLowerCase()).filter(Boolean);
  const equipment = records.find((record) => {
    const details = requestEquipmentDetails(record);
    return [details.chassis, details.door, details.reg].some((value) => value && keys.includes(text(value).toLowerCase()));
  });
  const isTipper = [request, equipment || {}].some((record) =>
    [record.equipmentGroup, record.group, record.equipment, record.equipmentName, record.itemName]
      .some((value) => /\btippers?\b/i.test(text(value))),
  );
  const savedTypes = new Set([...Object.keys(request.openingMeterReadings || {}), ...Object.keys(request.closingMeterReadings || {})]);
  // Wheeled vehicles record both hours and kilometres; equipment without
  // wheels has no odometer, so it records HMR only. The Equipment Master
  // category decides; a saved KMR meter type marks a vehicle when the master
  // record is not available to the caller.
  const primaryType = requestMeterTypeForRequest(request, records);
  const isVehicle = isTipper || (equipment ? requestEquipmentMeterType(equipment) === "KMR" : primaryType === "KMR");
  return isVehicle || primaryType === "KMR" || (savedTypes.has("HMR") && savedTypes.has("KMR")) ? ["HMR", "KMR"] : ["HMR"];
}

export function requestMeterReadings(request = {}, stage = "opening", records = []) {
  const primaryType = requestMeterTypeForRequest(request, records);
  const saved = request[`${stage}MeterReadings`] || {};
  return Object.fromEntries(requestMeterTypesForRequest(request, records).map((type) => [type,
    text(saved[type] ?? (type === primaryType ? request[`${stage}MeterReading`] : "")),
  ]));
}

export function requestMeterReadingLabel(request = {}, stage = "opening") {
  return Object.entries(requestMeterReadings(request, stage)).map(([type, reading]) => `${type} ${reading || "—"}`).join(" · ");
}

export function requestEquipmentOptionLabel(record = {}) {
  const details = requestEquipmentDetails(record);
  const context = [
    details.door && `Door ${details.door}`,
    details.reg && `Reg ${details.reg}`,
    details.site,
    text(record.manufacturerSerialNo) && `S/N ${text(record.manufacturerSerialNo)}`,
  ].filter(Boolean);
  return context.length ? `${details.equipment} — ${context.join(" — ")}` : details.equipment;
}

// Production users see the Equipment Master group in the selector rather
// than a vehicle number. The option value remains the record id, so the
// selected record still supplies door, site, and registration details through
// requestEquipmentDetails.
export function requestEquipmentGroupOptionLabel(record = {}) {
  return equipmentGroupValue(record);
}

/**
 * Return one option per equipment group, while retaining every source record
 * for the dependent door-number selector.  Equipment master imports can
 * contain hundreds of vehicles in the same group (for example, DOZERS), so
 * grouping is case-insensitive and whitespace-normalized for display.
 */
export function requestEquipmentGroupOptions(records = []) {
  const groups = new Map();
  for (const record of records) {
    if (record?.id == null) continue;
    const label = requestEquipmentGroupOptionLabel(record);
    const key = label.toLocaleLowerCase().replace(/\s+/g, " ");
    if (!label || groups.has(key)) {
      if (groups.has(key)) groups.get(key).records.push(record);
      continue;
    }
    groups.set(key, { key, label, records: [record] });
  }
  return [...groups.values()];
}

export function requestEquipmentRecordsForGroup(records = [], group = "") {
  const key = text(group).toLocaleLowerCase().replace(/\s+/g, " ");
  if (!key) return [];
  return records.filter(
    (record) => requestEquipmentGroupOptionLabel(record).toLocaleLowerCase().replace(/\s+/g, " ") === key,
  );
}

// Call with the already site/group-scoped records. Search never expands that scope.
export function requestEquipmentSearchOptions(records = [], query = "") {
  const seen = new Set();
  return records.flatMap((record) => {
    if (record?.id == null || seen.has(String(record.id))) return [];
    seen.add(String(record.id));
    const label = requestEquipmentOptionLabel(record);
    return matchesSmartSearch(query, label, requestEquipmentDetails(record), record.manufacturerSerialNo)
      ? [{ record, label }] : [];
  });
}

// Kept for compatibility with older callers/imported deployment helpers.
export function requestVehicleOptionLabel(record = {}) {
  return text(record.equipmentName);
}
