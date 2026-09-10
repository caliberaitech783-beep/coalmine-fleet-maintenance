import test from "node:test";
import assert from "node:assert/strict";
import {
  equipmentMetrics,
  equipmentRoadStatus,
  fleetAssetCounts,
  fleetBreakdownCaseCounts,
  fleetChartCounts,
  findFleetAssetForRequest,
  liveEquipmentMetrics,
  liveEquipmentRoadStatus,
} from "../dashboard-equipment-metrics.mjs";

test("dashboard equipment totals use all persisted master records", () => {
  assert.deepEqual(
    equipmentMetrics([
      { status: "Operational" },
      { status: "Breakdown" },
      { status: "Operational" },
    ]),
    { total: 3, onRoad: 2, offRoad: 1, idle: 0, unknown: 0, availability: 67 },
  );
});

test("fleet chart breakdowns are a subset of each category total, counting assets once", () => {
  const records = [
    ...Array.from({ length: 48 }, (_, index) => ({ category: "Equipment", door: `E${index}` })),
    ...Array.from({ length: 142 }, (_, index) => ({ category: "Vehicle", door: `V${index}` })),
  ];
  const requests = [
    ...Array.from({ length: 8 }, (_, index) => ({ door: `E${index}`, status: "Open" })),
    ...Array.from({ length: 20 }, (_, index) => ({ door: `V${index}`, status: "Open" })),
    { door: "E0", status: "Open" },
    { door: "V20", status: "Closed" },
    { door: "V21", status: "Idle" },
    { door: "V22", status: "Ideal" },
  ];
  assert.deepEqual(fleetChartCounts(records, requests), {
    equipment: 48, vehicles: 142, total: 190,
    breakdown: { equipment: 8, vehicles: 20, total: 28 },
  });
});

test("fleet chart counts only assets with active breakdown requests", () => {
  assert.deepEqual(fleetChartCounts(), {
    equipment: 0, vehicles: 0, total: 0,
    breakdown: { equipment: 0, vehicles: 0, total: 0 },
  });
  assert.deepEqual(fleetChartCounts([
    { category: "Equipment", status: "Off road" },
    { category: "Vehicles", status: "Operational" },
  ]), {
    equipment: 1, vehicles: 1, total: 2,
    breakdown: { equipment: 0, vehicles: 0, total: 0 },
  });
  assert.deepEqual(fleetChartCounts([
    { category: "Equipment", door: "E1", status: "Operational" },
    { category: "Vehicles", door: "V1", status: "Operational" },
  ], [
    { door: "E1", status: "Open" },
    { door: "V1", status: "Closed" },
  ]).breakdown, { equipment: 1, vehicles: 0, total: 1 });
});

test("fleet chart does not match one request to every asset sharing a group value", () => {
  const records = [
    { category: "Vehicles", equipment: "SCANIA TIPPERS", equipmentName: "S1 - MH01", door: "S1" },
    { category: "Vehicles", equipment: "SCANIA TIPPERS", equipmentName: "S2 - MH02", door: "S2" },
  ];
  assert.deepEqual(fleetChartCounts(records, [
    { equipment: "SCANIA TIPPERS", door: "S1", status: "Open" },
  ]).breakdown, { equipment: 0, vehicles: 1, total: 1 });
  assert.deepEqual(liveEquipmentMetrics(records,[{equipment:'SCANIA TIPPERS',door:'S1',status:'Open'}]),{
    total:2,onRoad:1,offRoad:1,idle:0,unknown:0,availability:50,
  });
});

test('live asset status respects specific identities and assigned sites, not shared names',()=>{
  const records=[
    {category:'Vehicle',equipment:'TIPPERS',equipmentName:'Dumper',door:'S1',chassisNo:'CH1',currentLocation:'Sasti OB'},
    {category:'Vehicle',equipment:'TIPPERS',equipmentName:'Dumper',door:'S2',chassisNo:'CH2',currentLocation:'Sasti OB'},
    {category:'Vehicle',equipment:'TIPPERS',equipmentName:'Dumper',door:'S1',chassisNo:'CH3',currentLocation:'Jayant OB'},
  ];
  const requests=[{equipment:'Dumper',door:'S1',chassis:'CH1',site:'Sasti OB',status:'Idle'}];
  assert.deepEqual(records.map(record=>liveEquipmentRoadStatus(record,requests)),['idle','onroad','onroad']);
  assert.deepEqual(liveEquipmentMetrics(records,requests),{total:3,onRoad:2,offRoad:0,idle:1,unknown:0,availability:67});
  const opened=requests.map(request=>({...request,status:'Awaiting parts'}));
  assert.equal(fleetChartCounts(records,opened).breakdown.total,1);
  assert.equal(liveEquipmentMetrics(records,opened).offRoad,1);
  assert.equal(liveEquipmentRoadStatus({equipmentName:'Dumper',equipment:'Dumper'},[{equipment:'Dumper',status:'Open'}]),'onroad');
});

test('legacy individual display names remain usable when stable identifiers are absent',()=>{
  assert.equal(liveEquipmentRoadStatus({equipmentName:'D23 - 07339',chassisNo:'7339'},[{equipment:'D23 - 07339',status:'Open'}]),'offroad');
});

test('recalculating after a workflow update cannot reuse a stale identity or state cache',()=>{
  const assets=[{door:'D1',currentLocation:'Sasti OB'}],requests=[{door:'D1',site:'Sasti OB',status:'Open'}];
  assert.equal(liveEquipmentMetrics(assets,requests).offRoad,1);
  requests[0].status='Idle';
  assert.equal(liveEquipmentMetrics(assets,requests).idle,1);
  requests[0].status='Closed';
  assert.equal(liveEquipmentMetrics(assets,requests).onRoad,1);
});

test("dashboard equipment totals handle an empty master", () => {
  assert.deepEqual(equipmentMetrics([]), {
    total: 0,
    onRoad: 0,
    offRoad: 0,
    idle: 0,
    unknown: 0,
    availability: 0,
  });
});

test("off-road totals exclude blank and neutral statuses", () => {
  assert.deepEqual(
    equipmentMetrics([
      { status: "" },
      { status: "Available" },
      { status: "In maintenance" },
      { status: "Off-road" },
      { status: "Breakdown" },
    ]),
    { total: 5, onRoad: 0, offRoad: 3, idle: 0, unknown: 2, availability: 0 },
  );
  assert.equal(equipmentRoadStatus({ status: "" }), "unknown");
});

test("idle is a distinct fleet state and is not counted on-road or off-road", () => {
  assert.deepEqual(equipmentMetrics([
    {status:"Operational"}, {status:"Idle"}, {status:"Off road"}, {status:"Idling"},
  ]), {total:4,onRoad:1,offRoad:1,idle:2,unknown:0,availability:25});
  assert.equal(equipmentRoadStatus({status:"Idle"}), "idle");
});

test("fleet totals use only the Equipment Master category column", () => {
  assert.deepEqual(fleetAssetCounts([
    { category: " EQUIPMENT ", group: "Truck" },
    { category: "equipment", chassisNo: "CH-100" },
    { category: "VEHICLE", itemName: "Excavator" },
    { category: "vehicles" },
    { category: "Utility asset", equipmentName: "Pickup" },
  ]), { equipment: 2, vehicles: 2, total: 5 });
});

test("live dashboard availability derives idle and off-road status only from active requests", () => {
  const equipment = [
    { equipmentName: "D23 - 07339", chassisNo: "7339", status: "" },
    { equipmentName: "HP12 - 10016", chassisNo: "JJ202405310016", status: "" },
    { equipmentName: "VPC60 - 80081", chassisNo: "80081", status: "Idle" },
    { equipmentName: "D16 - 24964", chassisNo: "24964", status: "" },
  ];
  const requests = [
    { equipment: "D23 - 07339", chassis: "7339", status: "Open" },
    { equipment: "HP12 - 10016", chassis: "JJ202405310016", status: "Closed" },
    { equipment: "D16 - 24964", chassis: "24964", status: "Idle" },
  ];
  assert.deepEqual(liveEquipmentMetrics(equipment, requests), {
    total: 4,
    onRoad: 2,
    offRoad: 1,
    idle: 1,
    unknown: 0,
    availability: 50,
  });
});

test("303-asset fleet ignores stale master breakdowns and immediately releases a closed request", () => {
  const records = Array.from({ length: 303 }, (_, index) => ({
    door: `FLEET-${index}`,
    currentLocation: "Sasti OB",
    status: index < 64 ? "Breakdown" : "Operational",
  }));
  const historicalRequests = Array.from({ length: 64 }, (_, index) => ({
    ref: `HISTORY-${index}`,
    door: `FLEET-${index}`,
    site: "Sasti OB",
    status: "Closed",
  }));
  const activeRequests = Array.from({ length: 35 }, (_, index) => ({
    ref: `ACTIVE-${index}`,
    door: `FLEET-${index + 64}`,
    site: "Sasti OB",
    status: "Open",
  }));
  const requests = [...historicalRequests, ...activeRequests];
  const originalMaster = structuredClone(records);

  assert.deepEqual(liveEquipmentMetrics(records, requests), {
    total: 303, onRoad: 268, offRoad: 35, idle: 0, unknown: 0, availability: 88,
  });
  activeRequests[0].status = "Closed";
  assert.deepEqual(liveEquipmentMetrics(records, requests), {
    total: 303, onRoad: 269, offRoad: 34, idle: 0, unknown: 0, availability: 89,
  });
  assert.deepEqual(records, originalMaster, "calculating live status must not rewrite master data");
  assert.equal(equipmentMetrics(records).offRoad, 64, "static master metrics retain their snapshot meaning");
});

test("closed or absent requests release every stale master status without modifying source data", () => {
  for (const status of ["Off road", "Breakdown", "In maintenance", "Idle", "Idling", "", "Operational"]) {
    const record = Object.freeze({ door: "D1", status });
    const closed = Object.freeze({ door: "D1", status: " Closed ", verifiedAt: "2026-09-08 12:00" });
    assert.equal(liveEquipmentRoadStatus(record, []), "onroad", `no active request: ${status}`);
    assert.equal(liveEquipmentRoadStatus(record, [closed]), "onroad", `closed request: ${status}`);
    assert.deepEqual(liveEquipmentMetrics([record], [closed]), {
      total: 1, onRoad: 1, offRoad: 0, idle: 0, unknown: 0, availability: 100,
    });
    assert.equal(record.status, status);
  }
});

test("idle approval, idle cancellation, and a new breakdown update live status despite stale master data", () => {
  const record = Object.freeze({ door: "D1", currentLocation: "Sasti OB", status: "Off road" });
  const request = { ref: "FIRST", door: "D1", site: "Sasti OB", status: "Open" };
  const requests = [request];
  const expectStatus = (expected) => {
    assert.equal(liveEquipmentRoadStatus(record, requests), expected);
    const metrics = liveEquipmentMetrics([record], requests);
    assert.equal(metrics.onRoad, Number(expected === "onroad"));
    assert.equal(metrics.offRoad, Number(expected === "offroad"));
    assert.equal(metrics.idle, Number(expected === "idle"));
  };

  expectStatus("offroad");
  request.status = "Idle";
  expectStatus("idle");
  request.status = "In progress"; // Cancelling Idle returns the request to maintenance.
  expectStatus("offroad");
  request.status = "Idle";
  expectStatus("idle");
  request.status = "Closed"; // Manager approval returns the asset to the road before MIS verification.
  expectStatus("onroad");
  request.verifiedAt = "2026-09-08 12:00";
  expectStatus("onroad");
  requests.push({ ref: "SECOND", door: "D1", site: "Sasti OB", status: "Open" });
  expectStatus("offroad");
  requests[1].status = "Closed";
  expectStatus("onroad");
});

test("live status supports maintenance states and the legacy Ideal spelling", () => {
  const record = { door: "D1", status: "Idle" };
  for (const status of ["Open", "In progress", "Awaiting parts"])
    assert.equal(liveEquipmentRoadStatus(record, [{ door: "D1", status }]), "offroad");
  for (const status of ["Idle", "Ideal", " IDLE "])
    assert.equal(liveEquipmentRoadStatus(record, [{ door: "D1", status }]), "idle");
  assert.equal(liveEquipmentRoadStatus(record, [{ door: "D1", status: "closed" }]), "onroad");
});

test("multiple requests for one asset count once and active maintenance takes priority over idle", () => {
  const records = [{ door: "D1", status: "Breakdown" }, { door: "D2", status: "Idle" }];
  const requests = [
    { ref: "ONE", door: "D1", status: "Open" },
    { ref: "TWO", door: "D1", status: "Awaiting parts" },
    { ref: "THREE", door: "D1", status: "Idle" },
    { ref: "HISTORY", door: "D1", status: "Closed" },
  ];
  assert.deepEqual(liveEquipmentMetrics(records, requests), {
    total: 2, onRoad: 1, offRoad: 1, idle: 0, unknown: 0, availability: 50,
  });
  requests[0].status = "Closed";
  requests[1].status = "Closed";
  assert.deepEqual(liveEquipmentMetrics(records, requests), {
    total: 2, onRoad: 1, offRoad: 0, idle: 1, unknown: 0, availability: 50,
  });
});

test("other-site active requests cannot revive stale off-road status at this site", () => {
  const records = [
    { door: "D1", chassisNo: "CH1", currentLocation: "Sasti OB", status: "Breakdown" },
    { door: "D1", chassisNo: "CH2", currentLocation: "Jayant OB", status: "Idle" },
  ];
  const requests = [
    { door: "D1", chassis: "CH1", site: "Sasti OB", status: "Closed" },
    { door: "D1", chassis: "CH2", site: "Jayant OB", status: "Open" },
  ];
  assert.deepEqual(records.map((record) => liveEquipmentRoadStatus(record, requests)), ["onroad", "offroad"]);
  assert.deepEqual(liveEquipmentMetrics(records, requests), {
    total: 2, onRoad: 1, offRoad: 1, idle: 0, unknown: 0, availability: 50,
  });
});

test("live metrics preserve registered master rows instead of silently deduplicating assets", () => {
  const records = [
    Object.freeze({ id: 1, door: "D1", status: "Off road" }),
    Object.freeze({ id: 2, door: "D1", status: "Off road" }),
  ];
  assert.deepEqual(liveEquipmentMetrics(Object.freeze(records), []), {
    total: 2, onRoad: 2, offRoad: 0, idle: 0, unknown: 0, availability: 100,
  });
});

test("fleet breakdown case counts count open requests, not matched assets", () => {
  const records = [
    { category: "Equipment", door: "E1", equipmentName: "Dumper" },
    { category: "Equipment", door: "E2", equipmentName: "Dumper" },
    { category: "Vehicle", door: "V1", reg: "MH31AB1234" },
  ];
  const requests = [
    { door: "E1", status: "Open" },
    { door: "E1", status: "Work in progress" },
    { equipment: "Dumper", status: "Open" },
    { door: "V1", status: "Idle" },
    { door: "V1", status: "Closed" },
    { reg: "MH31ZZ9999", status: "Open" },
  ];
  assert.deepEqual(fleetBreakdownCaseCounts(records, requests), { equipment: 3, vehicles: 2, total: 5 });
  assert.deepEqual(fleetBreakdownCaseCounts(), { equipment: 0, vehicles: 0, total: 0 });
});

test("Majri asset identity accepts harmless spacing and punctuation in door and chassis references", () => {
  const asset = Object.freeze({ door: "S1 - MH34BZ1234", chassisNo: "CH-001 / A", equipmentName: "S1 - MH34BZ1234", category: "Vehicle", currentLocation: "Majri OB", status: "Idle" });
  for (const request of [
    { door: "s1-mh34bz1234", site: "Majri", status: "Open" },
    { chassis: "ch001a", door: "S1 MH34BZ1234", site: "Majri II", status: "In progress" },
    { chassis: "CH 001-A", site: "Majri OB", status: "Awaiting parts" },
  ]) {
    assert.equal(findFleetAssetForRequest([asset], request), asset);
    assert.equal(liveEquipmentRoadStatus(asset, [request]), "offroad");
    assert.deepEqual(fleetChartCounts([asset], [request]).breakdown, { equipment: 0, vehicles: 1, total: 1 });
  }
  assert.equal(liveEquipmentRoadStatus(asset, [{ door: "S1MH34BZ1234", site: "Majri", status: "Idle" }]), "idle");
  assert.equal(liveEquipmentRoadStatus(asset, [{ door: "S1MH34BZ1234", site: "Majri", status: "Closed" }]), "onroad");
});

test("conflicting chassis identities cannot match vehicles sharing the same door or display name", () => {
  const records = [
    { door: "D1", chassisNo: "CH-001", equipmentName: "Dumper", category: "Vehicle", currentLocation: "Majri OB" },
    { door: "D1", chassisNo: "CH-002", equipmentName: "Dumper", category: "Vehicle", currentLocation: "Majri OB" },
  ];
  const request = { door: "D1", chassis: "CH002", equipment: "Dumper", site: "Majri", status: "Open" };
  assert.equal(findFleetAssetForRequest(records, request), records[1]);
  assert.deepEqual(records.map((record) => liveEquipmentRoadStatus(record, [request])), ["onroad", "offroad"]);
  assert.deepEqual(fleetChartCounts(records, [request]).breakdown, { equipment: 0, vehicles: 1, total: 1 });
  assert.equal(findFleetAssetForRequest(records, { ...request, chassis: "CH999" }), null);
});

test("serial and chassis identity has priority over an outdated door label, but identifier types are not interchangeable", () => {
  const asset = { door: "D1", manufacturerSerialNo: "SN-123", category: "Equipment", currentLocation: "Majri OB" };
  assert.equal(liveEquipmentRoadStatus(asset, [{ door: "OLD-D1", chassis: "SN123", site: "Majri OB", status: "Open" }]), "offroad");
  assert.equal(liveEquipmentRoadStatus(asset, [{ door: "SN123", site: "Majri OB", status: "Open" }]), "onroad");
  assert.equal(liveEquipmentRoadStatus(asset, [{ door: "D1", chassis: "SN999", site: "Majri OB", status: "Open" }]), "onroad");
});

test("unique request enrichment refuses ambiguous identifiers and shared group labels without altering the fleet", () => {
  const records = [
    Object.freeze({ id: 1, door: "D1", equipmentName: "Dumper", equipment: "TIPPERS", currentLocation: "Majri OB" }),
    Object.freeze({ id: 2, door: "D1", equipmentName: "Dumper", equipment: "TIPPERS", currentLocation: "Majri OB" }),
  ];
  assert.equal(findFleetAssetForRequest(records, { door: "D1", site: "Majri", status: "Open" }), null);
  assert.equal(findFleetAssetForRequest(records, { equipment: "Dumper", site: "Majri", status: "Open" }), null);
  assert.equal(findFleetAssetForRequest(records, { equipment: "TIPPERS", site: "Majri", status: "Open" }), null);
  assert.equal(fleetAssetCounts(records).total, 2);
  assert.deepEqual(records.map(({ id }) => id), [1, 2]);
});

test("formatted identifiers still respect site scope and duplicate requests count each physical master row only once", () => {
  const records = [
    { door: "S1 - REG01", chassisNo: "CH-01", category: "Vehicle", currentLocation: "Majri OB" },
    { door: "S1 - REG01", chassisNo: "CH-02", category: "Vehicle", currentLocation: "Sasti OB" },
    { door: "S2", chassisNo: "CH-03", category: "Equipment", currentLocation: "Majri OB" },
  ];
  const requests = [
    { door: "S1REG01", chassis: "CH01", site: "Majri II", status: "Open" },
    { door: "S1REG01", chassis: "CH01", site: "Majri II", status: "Awaiting parts" },
    { door: "S2", chassis: "CH03", site: "Majri II", status: "Idle" },
  ];
  assert.deepEqual(liveEquipmentMetrics(records, requests), { total: 3, onRoad: 1, offRoad: 1, idle: 1, unknown: 0, availability: 33 });
  assert.deepEqual(fleetChartCounts(records, requests).breakdown, { equipment: 0, vehicles: 1, total: 1 });
});

test("fleet lists carry each asset's current breakdown request or its live road status", async () => {
  const { fleetAssetRequestDetails } = await import("../dashboard-equipment-metrics.mjs");
  const records = [
    { id: 1, door: "S1 - REG01", chassisNo: "CH-01", category: "Vehicle", currentLocation: "Majri OB" },
    { id: 2, door: "S2", chassisNo: "CH-02", category: "Equipment", currentLocation: "Majri OB" },
    { id: 3, door: "S3", chassisNo: "CH-03", category: "Vehicle", currentLocation: "Majri OB" },
    { id: 4, door: "S4", chassisNo: "CH-04", category: "Vehicle", currentLocation: "Majri OB" },
  ];
  const requests = [
    { ref: "REQ-LATER", door: "S1REG01", chassis: "CH01", site: "Majri II", status: "Accepted", start: "2026-09-10 09:00:00" },
    { ref: "REQ-FIRST", door: "S1REG01", chassis: "CH01", site: "Majri II", status: "Open", start: "2026-09-09 08:00:00" },
    { ref: "REQ-IDLE", door: "S2", chassis: "CH02", site: "Majri II", status: "Idle", start: "2026-09-08 07:00:00" },
    { ref: "REQ-DONE", door: "S3", chassis: "CH03", site: "Majri II", status: "Closed", start: "2026-09-01 07:00:00", closedAt: "2026-09-02 07:00:00" },
  ];
  const rows = fleetAssetRequestDetails(records, requests);
  assert.deepEqual(rows.map(({ requestReference, requestStatus, requestStart, requestClosed }) => [requestReference, requestStatus, requestStart, requestClosed]), [
    ["REQ-FIRST", "Open", "2026-09-09 08:00:00", "—"],
    ["REQ-IDLE", "Idle", "2026-09-08 07:00:00", "—"],
    ["", "On road", "—", "—"],
    ["", "On road", "—", "—"],
  ]);
  assert.deepEqual(rows.map(({ id }) => id), [1, 2, 3, 4], "asset order and identity are preserved");
  assert.equal(rows[0].chassisNo, "CH-01", "original asset fields stay on the row");
});
