import test from "node:test";
import assert from "node:assert/strict";
import {applyLatestTransfer,latestTransferByEquipment,oracleEquipmentMasterRecord,transferMasterRecord} from "../equipment-transfer-sync.mjs";

test("maps Oracle equipment transfers to the Vehicle transfers master", () => {
  assert.deepEqual(transferMasterRecord({
    oracleTno: "10", transferNo: "ETR-1", transferDate: "2026-08-22",
    source: "SASTI OB", destination: "MAJRI OB", equipmentTno: "20",
    equipmentId: "D37-7585", modelNo: "D37", manufacturerSerialNo: "SER-1",
    chassisNo: "CH-1", dieselQty: "5", kmr: "10", hmr: "20", driver: "Santosh",
  }), {
    transferNo: "ETR-1", transferDate: "2026-08-22", source: "SASTI OB", destination: "MAJRI OB",
    equipment: "D37-7585", modelNo: "D37", manufacturerSerialNo: "SER-1", lastMaintenanceDate: "",
    driver: "Santosh", chassisNo: "CH-1", dieselQty: "5", kmr: "10", hmr: "20",
    oracleSource: "EQUIPMENTTRANSFER", oracleTno: "10", oracleEquipmentTno: "20",
  });
});

test("latest transfer updates matching Equipment Master current location", () => {
  const transfers = [
    {equipmentTno: "20", equipmentId: "D37-7585", destination: "SASTI OB", transferNo: "ETR-1", transferDate: "2026-08-21"},
    {equipmentTno: "20", equipmentId: "D37-7585", destination: "MAJRI OB", transferNo: "ETR-2", transferDate: "2026-08-22"},
  ];
  const updated = applyLatestTransfer(
    {equipmentName: "D37 - 7585", manufacturerSerialNo: "SER-1", status: "Operational"},
    latestTransferByEquipment(transfers),
  );
  assert.equal(updated.currentLocation, "MAJRI OB");
  assert.equal(updated.lastTransferNo, "ETR-2");
  assert.equal(updated.status, "Operational");
});

test("maps Oracle fleet assets without removing app-maintained status or latest transfer", () => {
  const mapped = oracleEquipmentMasterRecord({
    oracleEquipmentTno: "20", oracleEquipmentNo: "CMPL/M/1", equipmentId: "V1-100",
    equipmentName: "V1-100", currentLocation: "SASTI OB", category: "Vehicle",
    group: "Volvo Tipper", itemName: "Tipper", chassisNo: "CH-1",
  }, {
    status: "Off road", currentLocation: "MAJRI OB", lastTransferDate: "2026-08-22",
  });
  assert.equal(mapped.door, "V1-100");
  assert.equal(mapped.group, "Volvo Tipper");
  assert.equal(mapped.status, "Off road");
  assert.equal(mapped.currentLocation, "MAJRI OB");
  assert.equal(mapped.oracleSource, "EQUIPMENT");
});
