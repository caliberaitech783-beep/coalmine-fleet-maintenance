import { equipmentGroupValue } from './equipment-group.mjs';

function text(value) {
  return String(value ?? "").trim();
}

function equipmentReference(value) {
  return text(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
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
  const door =
    text(record.door) ||
    reg ||
    text(record.equipmentName) ||
    text(record.itemName) ||
    text(record.manufacturerSerialNo) ||
    equipment;
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
  const recordReferences = records.map((record) => {
    const details = requestEquipmentDetails(record);
    return {
      record,
      keys: [details.chassis, details.door, details.reg, details.equipment, record.manufacturerSerialNo]
        .map(equipmentReference)
        .filter(Boolean),
    };
  });
  let equipment = null;
  for (const requestKey of [request.chassis, request.door, request.reg, request.equipment].map(equipmentReference).filter(Boolean)) {
    const matches = recordReferences.filter(({ keys }) => keys.includes(requestKey));
    if (matches.length === 1) {
      equipment = matches[0].record;
      break;
    }
  }
  const details = requestEquipmentDetails(equipment || {});
  return {
    ...request,
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

// Kept for compatibility with older callers/imported deployment helpers.
export function requestVehicleOptionLabel(record = {}) {
  return text(record.equipmentName);
}
