const text = value => String(value ?? '').trim();
const key = value => text(value).toUpperCase().replace(/[^A-Z0-9]/g, '');

// Never join an ambiguous label to an arbitrary vehicle. Oracle's stable ID wins.
export function withFleetDriverNames(equipment = [], drivers = []) {
  const byId = new Map(), byAlias = new Map();
  for (const driver of drivers) {
    if (!text(driver.driverName)) continue;
    if (text(driver.oracleEquipmentTno)) byId.set(text(driver.oracleEquipmentTno), driver);
    for (const alias of new Set([driver.equipmentId, driver.equipmentName, driver.oracleEquipmentNo, driver.vehicleNo].map(key).filter(Boolean))) {
      if (!byAlias.has(alias)) byAlias.set(alias, driver);
      else if (byAlias.get(alias) !== driver) byAlias.set(alias, null);
    }
  }
  return equipment.map(record => {
    const id = text(record.oracleEquipmentTno);
    const matches = new Set([record.equipmentId, record.equipmentName, record.oracleEquipmentNo, record.door, record.reg]
      .map(key).filter(Boolean).map(alias => byAlias.get(alias)).filter(Boolean)
      .filter(driver => !id || !text(driver.oracleEquipmentTno) || id === text(driver.oracleEquipmentTno)));
    const driver = byId.get(id) || (matches.size === 1 ? [...matches][0] : null);
    return driver ? {...record, logbookDriverName: text(driver.driverName), logbookDriverAt: driver.driverAt} : record;
  });
}
