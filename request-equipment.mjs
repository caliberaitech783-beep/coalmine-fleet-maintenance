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
