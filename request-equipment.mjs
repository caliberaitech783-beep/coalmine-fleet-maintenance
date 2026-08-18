function text(value) {
  return String(value ?? "").trim();
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
  return {
    equipment,
    door: text(record.door),
    reg: text(record.registration) || text(record.reg),
    site: text(record.currentLocation) || text(record.location),
  };
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
  return text(record.group);
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
