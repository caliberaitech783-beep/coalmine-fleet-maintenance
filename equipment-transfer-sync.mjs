const normalized = (value) => String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

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
