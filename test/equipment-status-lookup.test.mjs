import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {liveEquipmentRoadStatus, liveEquipmentRoadStatusLookup} from "../dashboard-equipment-metrics.mjs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

const sameAsPerAsset = (records, requests, message) => {
  const statusOf = liveEquipmentRoadStatusLookup(requests);
  assert.deepEqual(records.map(statusOf), records.map((record) => liveEquipmentRoadStatus(record, requests)), message);
};

test("the lookup gives every asset the status liveEquipmentRoadStatus gives it", () => {
  const records = [
    {equipmentName: "CAT 777E", door: "D-101", chassisNo: "CH-101", currentLocation: "Nigahi", category: "Equipment"},
    {equipmentName: "CAT 777E", door: "D-102", chassisNo: "CH-102", currentLocation: "Nigahi", category: "Equipment"},
    {equipmentName: "CAT 777E", door: "D-101", chassisNo: "CH-201", currentLocation: "Jayant", category: "Equipment"},
    {equipmentName: "Bolero", door: "L-7", chassisNo: "CH-301", currentLocation: "Nigahi", category: "Vehicle"},
    {equipmentName: "Bolero", door: "L-7", chassisNo: "CH-301", currentLocation: "Nigahi", category: "Vehicle"},
    {equipmentName: "Grader 14", door: "G 14", currentLocation: "Amlohri", status: "Breakdown"},
    {equipmentName: "Fixed", door: "F-1", currentLocation: "Nigahi", dashboardRoadStatus: "unknown"},
    {equipmentName: "Idle only", door: "I-1", chassisNo: "CH-401", currentLocation: "Khadia"},
    {equipmentName: "Running", door: "R-1", chassisNo: "CH-501", currentLocation: "Khadia"},
    {},
  ];
  const requests = [
    {ref: "R1", equipment: "CAT 777E", door: "D-101", chassis: "CH-101", site: "Nigahi", status: "Open"},
    {ref: "R2", equipment: "CAT 777E", door: "D-102", chassis: "CH-102", site: "Nigahi", status: "Closed", vehicleIdle: false},
    {ref: "R3", equipment: "CAT 777E", door: "D-101", site: "Jayant", status: "In progress"},
    {ref: "R4", equipment: "Bolero", door: "L-7", chassis: "CH-301", site: "Nigahi", status: "Awaiting parts"},
    {ref: "R5", equipment: "Grader 14", door: "g-14", site: "Amlohri", status: "Closed", vehicleIdle: false},
    {ref: "R6", equipment: "Fixed", door: "F-1", site: "Nigahi", status: "Open"},
    {ref: "R7", equipment: "Idle only", door: "I-1", chassis: "CH-401", site: "Khadia", status: "Closed", vehicleIdle: true},
    {ref: "R8", equipment: "Idle only", door: "I-1", chassis: "CH-401", site: "Khadia", status: "Ideal"},
    {ref: "R9", equipment: "Running", door: "R-1", chassis: "CH-501", site: "Khadia", status: "Running BD"},
    {ref: "R10", equipment: "Running", door: "R-1", chassis: "CH-501", site: "Khadia", status: "Idle"},
    {ref: "R11", equipment: "Unknown asset", door: "ZZ-9", site: "Bina", status: "Open"},
    {ref: "R12", status: "Closed", idealRequestedAt: "2026-11-01 10:00:00"},
  ];
  sameAsPerAsset(records, requests);
  sameAsPerAsset(records, [...requests].reverse(), "request order does not change any status");
  sameAsPerAsset(records, [], "no requests");
  sameAsPerAsset([], requests, "no assets");
  const statusOf = liveEquipmentRoadStatusLookup(requests);
  assert.equal(statusOf(records[0]), "offroad");
  assert.equal(statusOf(records[1]), "onroad", "a closed request releases the asset");
  assert.equal(statusOf(records[6]), "unknown", "a fixed dashboard status is kept");
  assert.equal(statusOf(records[7]), "idle");
});

test("the lookup matches the per-asset rule across generated fleets", () => {
  let seed = 20261113;
  const random = (limit) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % limit; };
  const sites = ["Nigahi", "Jayant", "Amlohri", "Khadia"];
  const statuses = ["Open", "Accepted", "In progress", "Awaiting parts", "Running BD", "Idle", "Ideal", "Closed", "Closed", "Closed", " closed ", ""];
  for (let round = 0; round < 25; round += 1) {
    const records = Array.from({length: 40}, (_, index) => ({
      equipmentName: `Unit ${random(12)}`, door: random(5) ? `D-${random(30)}` : "",
      chassisNo: random(4) ? `CH-${random(45)}` : "", manufacturerSerialNo: random(6) ? "" : `SN-${random(20)}`,
      currentLocation: sites[random(sites.length)], category: random(2) ? "Equipment" : "Vehicle", group: random(7) ? "Dumper" : "LMV",
      ...(random(15) ? {} : {dashboardRoadStatus: ["onroad", "offroad", "idle", "unknown"][random(4)]}),
      id: index,
    }));
    const requests = Array.from({length: 160}, (_, index) => ({
      ref: `REQ-${round}-${index}`, equipment: `Unit ${random(12)}`, door: random(5) ? `D-${random(30)}` : "",
      chassis: random(3) ? `CH-${random(45)}` : "", reg: random(9) ? "" : `SN-${random(20)}`,
      site: sites[random(sites.length)], equipmentGroup: random(7) ? "Dumper" : "LMV",
      status: statuses[random(statuses.length)],
      ...(random(3) ? {vehicleIdle: random(6) === 0} : random(2) ? {idealRequestedAt: "2026-11-01 10:00:00", ...(random(2) ? {idealApprovedAt: "2026-11-02 10:00:00"} : {})} : {}),
    }));
    sameAsPerAsset(records, requests, `round ${round}`);
  }
});

test("an asset's answer is remembered, and a changed request list needs a new lookup", () => {
  const record = {equipmentName: "Dozer", door: "DZ-1", chassisNo: "CH-9", currentLocation: "Nigahi"};
  let statusReads = 0;
  const request = {equipment: "Dozer", door: "DZ-1", chassis: "CH-9", site: "Nigahi", get status() { statusReads += 1; return "Open"; }};
  const statusOf = liveEquipmentRoadStatusLookup([request]);
  assert.equal(statusOf(record), "offroad");
  const readsAfterFirst = statusReads;
  for (let call = 0; call < 500; call += 1) assert.equal(statusOf(record), "offroad");
  assert.equal(statusReads, readsAfterFirst, "repeat questions about one asset do not read the requests again");
  assert.equal(statusOf({...record}), "offroad", "an edited copy of the asset is worked out afresh");
  const afterClosure = liveEquipmentRoadStatusLookup([{...request, status: "Closed", vehicleIdle: false}]);
  assert.equal(afterClosure(record), "onroad");
  assert.equal(liveEquipmentRoadStatusLookup(null)(record), "onroad");
  assert.equal(liveEquipmentRoadStatusLookup([request])(), "onroad");
});

test("closed requests are set aside once, not once per asset", () => {
  let statusReads = 0;
  const closed = Array.from({length: 2000}, (_, index) => ({door: `C-${index}`, vehicleIdle: false, get status() { statusReads += 1; return "Closed"; }}));
  const records = Array.from({length: 300}, (_, index) => ({equipmentName: `Unit ${index}`, door: `D-${index}`, currentLocation: "Nigahi"}));
  const statusOf = liveEquipmentRoadStatusLookup([...closed, {door: "D-7", site: "Nigahi", status: "Open"}]);
  const afterBuild = statusReads;
  const result = records.map(statusOf);
  assert.equal(statusReads, afterBuild, "no closed request is read again for any of the 300 assets");
  assert.equal(result.filter((status) => status === "offroad").length, 1);
  assert.equal(result[7], "offroad");
});

test("the Equipment table asks one lookup per request list for its live status column", () => {
  assert.match(source, /liveEquipmentRoadStatusLookup, liveEquipmentRoadStatuses \} from "\.\.\/dashboard-equipment-metrics\.mjs";/);
  const component = source.slice(source.indexOf("function Equipment({"), source.indexOf("const equipmentColumns = ["));
  assert.match(component, /const liveStatusLookup = useMemo\(\(\) => Array\.isArray\(statusRequests\) \? liveEquipmentRoadStatusLookup\(statusRequests\) : null, \[statusRequests\]\);/);
  assert.match(component, /const roadStatusFor = \(record\) => Array\.isArray\(statusRequests\)\n\s+\? \(typeof liveStatusLookup === "function" \? liveStatusLookup\(record\) : liveEquipmentRoadStatus\(record, statusRequests\)\)\n\s+: equipmentRoadStatus\(record\);/);
});
