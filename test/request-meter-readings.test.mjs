import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {requestEquipmentMeterType} from "../request-equipment.mjs";
import {validMeterEvidenceDataUrl, validMeterReading} from "../request-workflow.mjs";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("vehicles use KMR and equipment uses HMR", () => {
  assert.equal(requestEquipmentMeterType({category: "Vehicle"}), "KMR");
  assert.equal(requestEquipmentMeterType({category: "Vehicles"}), "KMR");
  assert.equal(requestEquipmentMeterType({category: "Equipment"}), "HMR");
  assert.equal(requestEquipmentMeterType({}), "HMR");
});

test("meter readings and evidence files are validated", () => {
  assert.equal(validMeterReading("12345"), true);
  assert.equal(validMeterReading("12345.67"), true);
  assert.equal(validMeterReading("-1"), false);
  assert.equal(validMeterReading("12.345"), false);
  assert.equal(validMeterEvidenceDataUrl("data:image/jpeg;base64,/9j/2Q=="), true);
  assert.equal(validMeterEvidenceDataUrl("data:application/pdf;base64,JVBERg=="), true);
  assert.equal(validMeterEvidenceDataUrl("data:text/plain;base64,SGVsbG8="), false);
});

test("opening and closing KMR/HMR values and files flow through every operational workspace", () => {
  assert.match(source, /name="openingMeterReading"[\s\S]*name="openingMeterFile"/);
  assert.match(source, /showMeterData[\s\S]*Opening KMR\/HMR[\s\S]*Closing KMR\/HMR/);
  assert.match(source, /Opening \{request\.meterType \|\| "KMR\/HMR"\}[\s\S]*MeterFileCell/);
  assert.match(source, /name="closingMeterReading"[\s\S]*name="closingMeterFile"/);
  assert.match(server, /opening_meter_reading TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /closing_meter_reading TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /app\.get\('\/api\/requests\/:reference\/meter-file'/);
  assert.match(server, /closing_meter_reading=\$6,closing_meter_file=\$7/);
});
