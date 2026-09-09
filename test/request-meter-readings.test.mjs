import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {requestEquipmentMeterType, requestMeterTypeForRequest, requestMeterTypesForRequest, requestMeterReadings, requestMeterReadingLabel} from "../request-equipment.mjs";
import {validMeterEvidenceDataUrl, validMeterReading, validMeterReadings} from "../request-workflow.mjs";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("vehicles use KMR and equipment uses HMR", () => {
  assert.equal(requestEquipmentMeterType({category: "Vehicle"}), "KMR");
  assert.equal(requestEquipmentMeterType({category: "Vehicles"}), "KMR");
  assert.equal(requestEquipmentMeterType({category: "Equipment"}), "HMR");
  assert.equal(requestEquipmentMeterType({}), "HMR");
});

test("legacy requests derive their meter type from the matching equipment", () => {
  const records = [
    {category: "Vehicle", door: "S116", chassisNo: "MYKG8X4MON5663995"},
    {category: "Equipment", door: "PL79", chassisNo: "MH40CX9284"},
  ];
  assert.equal(requestMeterTypeForRequest({door: "S116", chassis: "MYKG8X4MON5663995"}, records), "KMR");
  assert.equal(requestMeterTypeForRequest({door: "PL79"}, records), "HMR");
  assert.equal(requestMeterTypeForRequest({meterType: "KMR", door: "PL79"}, records), "KMR");
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

test("request edit captures opening KMR/HMR evidence but leaves closing evidence to the close workflow", () => {
  const createForm = source.slice(source.indexOf("function MaintenanceForm"), source.indexOf("function Subsidiaries"));
  const editForm = source.slice(source.indexOf("function RequestEditForm"), source.indexOf("function CloseRequestForm"));
  const closeForm = source.slice(source.indexOf("function CloseRequestForm"), source.indexOf("function VerifyRequestForm"));

  assert.doesNotMatch(createForm, /name="openingMeterReading"|name="openingMeterFile"|name="closingMeterReading"|name="closingMeterFile"/);
  assert.match(editForm, /MeterReadingFields[^>]*stage="opening"[\s\S]*name="openingMeterFile"/);
  assert.doesNotMatch(editForm, /name="closingMeterReading"|name="closingMeterFile"/);
  assert.match(editForm, /Trip card upload \(optional\)/);
  assert.doesNotMatch(editForm, /MeterReadingFields[^>]*required/);
  assert.doesNotMatch(editForm, /name="openingMeterReading"[^>]*required|name="openingMeterFile"[^>]*required/);
  assert.match(closeForm, /MeterReadingFields[^>]*stage="closing"/);
  assert.match(source, /showMeterData[\s\S]*Opening KMR\/HMR[\s\S]*Closing KMR\/HMR/);
  assert.match(source, /requestMeterReadingLabel\(request, "opening"\)[\s\S]*MeterFileCell/);
  assert.match(server, /opening_meter_reading TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /closing_meter_reading TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /app\.get\('\/api\/requests\/:reference\/meter-file'/);
  assert.match(server, /opening_meter_reading=\$5/);
  assert.match(server, /closing_meter_reading=\$6,closing_meter_readings=closing_meter_readings \|\| \$9::jsonb WHERE reference=\$7/);
});

test("MIS verification requires the closing reading without a closing meter file", () => {
  const verifyForm = source.slice(source.indexOf("function VerifyRequestForm"), source.indexOf("const ticketCategories"));
  const verifyRoute = server.slice(server.indexOf("app.patch('/api/requests/:reference/verify'"), server.indexOf("app.get('/api/requests/:reference/trip-card'"));

  assert.match(verifyForm, /MeterReadingFields[^>]*stage="closing"[^>]*required/);
  assert.doesNotMatch(verifyForm, /closingMeterFile|Closing \{request\.meterType \|\| "KMR\/HMR"\} file/);
  assert.doesNotMatch(verifyRoute, /closingMeterFile|validMeterEvidenceDataUrl|closing_meter_file=/);
  assert.match(verifyRoute, /closing_meter_reading=\$6,closing_meter_readings=closing_meter_readings \|\| \$9::jsonb WHERE reference=\$7/);
});

test("request edit validates opening evidence and does not modify closing evidence", () => {
  const editRoute = server.slice(server.indexOf("app.patch('/api/requests/:reference'"), server.indexOf("app.patch('/api/requests/:reference/close'"));

  assert.match(editRoute, /validMeterReading\(normalizedOpeningMeterReading\)/);
  assert.match(editRoute, /if\(normalizedOpeningMeterReading&&!validMeterReading/);
  assert.doesNotMatch(editRoute, /normalizedClosingMeterReading|closing_meter_reading=|closing_meter_file=/);
  assert.doesNotMatch(editRoute, /if\(normalizedMeterType!=='KMR'&&!openingMeterFile/);
  assert.match(editRoute, /opening_meter_file=CASE WHEN \$6<>'' THEN \$6 ELSE opening_meter_file END/);
});

test("tippers expose both meters using the group, legacy name, matching master or saved readings", () => {
  for (const request of [{equipmentGroup: "TIPPERS"}, {equipment: "Tipper"}, {openingMeterReadings: {HMR: "0", KMR: "12"}}]) {
    assert.deepEqual(requestMeterTypesForRequest(request), ["HMR", "KMR"]);
  }
  assert.deepEqual(requestMeterTypesForRequest({door: " T1 ", meterType: "KMR"}, [{door: "t1", group: "Tippers", category: "Vehicle"}]), ["HMR", "KMR"]);
  assert.deepEqual(requestMeterTypesForRequest({meterType: "KMR", equipmentGroup: "LIGHT VEHICLES"}), ["KMR"]);
  assert.deepEqual(requestMeterTypesForRequest({meterType: "HMR", equipmentGroup: "EXCAVATORS"}), ["HMR"]);
});

test("legacy tipper readings populate their original meter without duplicating it into the second meter", () => {
  const request = {equipmentGroup: "Tippers", meterType: "KMR", openingMeterReading: "42000", closingMeterReading: "42001"};
  assert.deepEqual(requestMeterReadings(request), {HMR: "", KMR: "42000"});
  assert.deepEqual(requestMeterReadings({...request, openingMeterReadings: {HMR: "0", KMR: "42002"}}), {HMR: "0", KMR: "42002"});
  assert.deepEqual(requestMeterReadings(request, "closing"), {HMR: "", KMR: "42001"});
  assert.equal(requestMeterReadingLabel({...request, openingMeterReadings: {HMR: "12.25", KMR: "42000"}}), "HMR 12.25 · KMR 42000");
});

test("dual-meter validation rejects malformed maps and invalid values in either meter", () => {
  assert.equal(validMeterReadings({HMR: "0", KMR: "123.45"}), true);
  assert.equal(validMeterReadings({HMR: "", KMR: ""}), true);
  for (const value of [null, [], "12", {RPM: "1"}, {HMR: "-1", KMR: "20"}, {HMR: "1", KMR: "2.345"}, {HMR: {value: 3}}]) {
    assert.equal(validMeterReadings(value), false);
  }
});
