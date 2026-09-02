import test from "node:test";
import assert from "node:assert/strict";
import {
  findRequestEquipment,
  requestEquipmentDetails,
  requestEquipmentOptionLabel,
  requestEquipmentGroupOptionLabel,
  requestEquipmentGroupOptions,
  requestEquipmentRecordsForGroup,
  requestVehicleOptionLabel,
} from "../request-equipment.mjs";

test("selects request equipment by stable id when names are duplicated", () => {
  const records = [
    { id: 41, equipmentName: "Excavator", currentLocation: "Sasti OB" },
    { id: 42, equipmentName: "Excavator", currentLocation: "Jayant OB" },
  ];
  assert.equal(findRequestEquipment(records, "42"), records[1]);
  assert.equal(findRequestEquipment(records, "missing"), null);
});

test("builds request details from current and legacy equipment fields", () => {
  assert.deepEqual(
    requestEquipmentDetails({
      id: 7,
      equipmentName: "PC200",
      group: "EXCAVATOR",
      door: "D-17",
      registration: "MH-01-AA-1010",
      chassisNo: "CH-100",
      make: "Komatsu",
      model: "PC200-8",
      currentLocation: "Majri OB",
      location: "Legacy site",
    }),
    { equipment: "PC200", group: "EXCAVATOR", door: "D-17", reg: "MH-01-AA-1010", chassis: "CH-100", make: "Komatsu", model: "PC200-8", site: "Majri OB" },
  );
  assert.equal(requestEquipmentDetails({ itemName: "Dozer", location: "Lalpeth OB" }).site, "Lalpeth OB");
});

test("selected imported equipment supplies a door identifier when the door field is blank", () => {
  assert.deepEqual(
    requestEquipmentDetails({
      id: 228,
      equipmentName: "PL69–MP66ZB8422",
      category: "EQUIPMENT",
      currentLocation: "Gouri Pouni OB (2ND)",
      door: "",
      reg: "",
    }),
    {
      equipment: "PL69–MP66ZB8422",
      group: "",
      door: "PL69–MP66ZB8422",
      reg: "",
      chassis: "",
      make: "",
      model: "",
      site: "Gouri Pouni OB (2ND)",
    },
  );
});

test("request details expose the equipment make and model for the request form", () => {
  const details = requestEquipmentDetails({
    id: 12,
    equipmentName: "Tipper",
    make: "  Tata  ",
    model: "  Signa 2823  ",
  });
  assert.equal(details.make, "Tata");
  assert.equal(details.model, "Signa 2823");

  // Transfer-sourced records carry the model under modelNo.
  assert.equal(requestEquipmentDetails({ equipmentName: "Dozer", modelNo: "D65EX" }).model, "D65EX");
  assert.equal(requestEquipmentDetails({ equipmentName: "Dozer", model: "D85", modelNo: "D65EX" }).model, "D85");

  // Equipment without make/model must not break the lookup.
  assert.equal(requestEquipmentDetails({ equipmentName: "Loader" }).make, "");
  assert.equal(requestEquipmentDetails({ equipmentName: "Loader" }).model, "");
});

test("equipment option labels include context that distinguishes duplicate names", () => {
  assert.equal(
    requestEquipmentOptionLabel({
      equipmentName: "Excavator",
      door: "EX-2",
      currentLocation: "Dudhichua OB",
      manufacturerSerialNo: "SN-99",
    }),
    "Excavator — Door EX-2 — Dudhichua OB — S/N SN-99",
  );
});

test("production equipment group option labels use the Equipment Master group", () => {
  assert.equal(
    requestEquipmentGroupOptionLabel({
      group: "EXCAVATOR",
      equipmentName: "VPC48 - 62534",
      currentLocation: "Jayant OB",
    }),
    "EXCAVATOR",
  );
  assert.equal(requestEquipmentGroupOptionLabel({ equipmentName: "VPC48 - 62534" }), "");
});

test("equipment group options are unique but retain all related vehicles", () => {
  const records = [
    { id: 1, group: "EXCAVATOR", door: "EX-01" },
    { id: 2, group: "excavator", door: "EX-02" },
    { id: 3, group: "DOZER", door: "DZ-01" },
  ];
  const options = requestEquipmentGroupOptions(records);
  assert.deepEqual(options.map((option) => option.label), ["EXCAVATOR", "DOZER"]);
  assert.deepEqual(
    requestEquipmentRecordsForGroup(records, "excavator").map((record) => record.door),
    ["EX-01", "EX-02"],
  );
});

test("legacy vehicle option labels remain compatible", () => {
  assert.equal(
    requestVehicleOptionLabel({
      equipmentName: "VPC48 - 62534",
      currentLocation: "Jayant OB",
      manufacturerSerialNo: "SN-99",
    }),
    "VPC48 - 62534",
  );
  assert.equal(requestVehicleOptionLabel({ itemName: "Excavator", door: "D-1" }), "");
});
