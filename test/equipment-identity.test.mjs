import test from "node:test";
import assert from "node:assert/strict";
import { equipmentIdentity } from "../equipment-identity.mjs";

test("matches equipment by manufacturer serial number regardless of case", () => {
  assert.equal(
    equipmentIdentity({ manufacturerSerialNo: " SR-100 " }),
    equipmentIdentity({ manufacturerSerialNo: "sr-100" }),
  );
});

test("falls back to the equipment descriptive fields", () => {
  assert.equal(
    equipmentIdentity({ currentLocation: "Sasti II", equipmentName: "Excavator", make: "Tata" }),
    equipmentIdentity({ location: "sasti ii", equipmentName: "excavator", make: "tata" }),
  );
});

test("does not create an identity for an empty record", () => {
  assert.equal(equipmentIdentity({}), "");
});
