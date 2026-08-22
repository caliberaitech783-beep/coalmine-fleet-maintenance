const normalized = (value) => String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

export const allowedEquipmentTypes = [
  "TIPPER", "TIPPERS", "EQUIPMENT", "EQUIPMENTS", "VEHICLE", "VEHICLES",
  "GRADER", "GRADERS", "DOZER", "DOZERS", "TRUCK", "TRUCKS",
  "HAULPAK", "HAULPACK", "DUMPER", "DRILL MACHINE", "EXCAVATOR",
  "LOADER", "BACKHOE LOADER", "WATER TANKER", "DIESEL TANKER",
  "PAY LOADER", "EICHER TIPPERS", "SURFACE MINER", "HEAVY MOTOR VEHICLE",
  "COAL TIPPERS",
];

export function isAllowedOracleEquipment(record = {}) {
  const values = [record.group, record.itemName].map(normalized).filter(Boolean);
  const exactTypes = new Set(allowedEquipmentTypes.map(normalized));
  const familyTypes = ["TIPPER", "HAULPAK", "HAULPACK", "DUMPER"].map(normalized);
  return values.some((value) => exactTypes.has(value) || familyTypes.some((type) => value.includes(type)));
}

export function transferMasterRecord(transfer = {}) {
  const equipment = transfer.equipmentId || transfer.equipmentName || transfer.equipmentNo || "";
  return {
    transferNo: transfer.transferNo || "",
    transferDate: transfer.transferDate || "",
    source: transfer.source || "",
    destination: transfer.destination || "",
    equipment,
    modelNo: transfer.modelNo || "",
    manufacturerSerialNo: transfer.manufacturerSerialNo || "",
    lastMaintenanceDate: "",
    driver: transfer.driver || transfer.driverCode || "",
    chassisNo: transfer.chassisNo || "",
    dieselQty: transfer.dieselQty || "",
    kmr: transfer.kmr || "",
    hmr: transfer.hmr || "",
    oracleSource: "EQUIPMENTTRANSFER",
    oracleTno: transfer.oracleTno || "",
    oracleEquipmentTno: transfer.equipmentTno || "",
  };
}

export function equipmentMatchKeys(record = {}) {
  return [
    record.oracleEquipmentTno,
    record.oracleEquipmentNo,
    record.equipmentTno,
    record.equipmentId,
    record.equipmentNo,
    record.equipmentName,
    record.manufacturerSerialNo,
    record.chassisNo,
    record.door,
    record.reg,
    record.asset,
  ].map(normalized).filter(Boolean);
}

export function latestTransferByEquipment(transfers = []) {
  const latest = new Map();
  for (const transfer of transfers) {
    for (const key of equipmentMatchKeys(transfer)) latest.set(key, transfer);
  }
  return latest;
}

export function applyLatestTransfer(record, latestByEquipment) {
  const transfer = equipmentMatchKeys(record).map((key) => latestByEquipment.get(key)).find(Boolean);
  if (!transfer?.destination) return record;
  return {
    ...record,
    currentLocation: transfer.destination,
    oracleEquipmentTno: transfer.equipmentTno || record.oracleEquipmentTno || "",
    lastTransferNo: transfer.transferNo || "",
    lastTransferDate: transfer.transferDate || "",
  };
}

export function oracleEquipmentMasterRecord(equipment = {}, existing = {}) {
  return {
    ...existing,
    door: equipment.equipmentId || equipment.equipmentName || existing.door || "",
    reg: equipment.registrationNo || equipment.vrnNo || existing.reg || "",
    currentLocation: existing.lastTransferDate ? existing.currentLocation : (equipment.currentLocation || existing.currentLocation || ""),
    equipmentName: equipment.equipmentName || equipment.equipmentId || existing.equipmentName || "",
    category: equipment.category || existing.category || "",
    group: equipment.group || existing.group || "",
    itemName: equipment.itemName || existing.itemName || "",
    itemSpecification: equipment.itemSpecification || existing.itemSpecification || "",
    acquisitionDate: equipment.acquisitionDate || existing.acquisitionDate || "",
    make: equipment.make || existing.make || "",
    model: equipment.model || existing.model || "",
    manufacturerSerialNo: equipment.manufacturerSerialNo || existing.manufacturerSerialNo || "",
    engineNo: equipment.engineNo || existing.engineNo || "",
    chassisNo: equipment.chassisNo || existing.chassisNo || "",
    documentStatus: equipment.documentStatus || existing.documentStatus || "",
    asset: equipment.asset || existing.asset || "",
    status: existing.status || "Operational",
    oracleSource: "EQUIPMENT",
    oracleEquipmentTno: equipment.oracleEquipmentTno || existing.oracleEquipmentTno || "",
    oracleEquipmentNo: equipment.oracleEquipmentNo || existing.oracleEquipmentNo || "",
  };
}
