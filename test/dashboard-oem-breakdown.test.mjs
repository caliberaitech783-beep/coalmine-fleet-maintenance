import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildOemBreakdownRows, buildOemBreakdownChart, selectOemBreakdownRows, createOemBreakdownSelection, oemDateRangeError } from "../src/oem-breakdown-model.mjs";

const now = Date.parse("2026-09-14T12:00:00+05:30");
const equipment = [
  { id: 1, equipmentName: "E1", door: "E1", make: "Tata", group: "Excavator", currentLocation: "Sasti OB", category: "Equipment", status: "Operational" },
  { id: 2, equipmentName: "V1", door: "V1", make: " tata ", group: "Tipper", currentLocation: "Sasti II", category: "Vehicle", status: "Operational" },
  { id: 3, equipmentName: "V2", door: "V2", make: "Komatsu", group: "Tipper", currentLocation: "Jayant OB", category: "Vehicle", status: "Operational" },
  { id: 4, equipmentName: "E2", door: "E2", make: "Komatsu", group: "Dozer", currentLocation: "Sasti OB", category: "Equipment", status: "Operational" },
  { id: 5, equipmentName: "E3", door: "E3", group: "Grader", currentLocation: "Jayant OB", status: "Breakdown" },
];
const requests = [
  { ref: "BD1", door: "E1", site: "Sasti OB", start: "2026-09-10 · 10:00:00", status: "Open", complaint: "Hydraulics" },
  { ref: "BD2", door: "E1", site: "Sasti OB", start: "2026-09-12 08:00", status: "Awaiting parts" },
  { ref: "BD3", door: "V1", site: "Sasti OB", start: "2026-09-01 08:00", status: "Closed", closedAt: "2026-09-11T04:30:00Z" },
  { ref: "BD4", door: "V2", site: "Jayant OB", start: "2026-09-10 08:00", status: "Idle", closedAt: "2026-09-13 17:00" },
  { ref: "BD5", door: "E2", site: "Sasti OB", start: "2026-09-14 08:00", status: "In progress" },
];
const regions = [{ code: "WCL", sites: ["Sasti OB", "Majri OB"] }, { code: "NCL", sites: ["Jayant OB"] }];
const build = (options = {}) => buildOemBreakdownRows({ equipment, requests, now, ...options });

test("live OEM BD counts each asset once, excludes closed/idle and retains all active request details", () => {
  const rows = build();
  assert.deepEqual(rows.map((row) => row.record.id), [1, 4, 5]);
  assert.equal(rows[0].requests.length, 2);
  assert.equal(rows[0].requests[0].complaint, "Hydraulics");
  assert.equal(rows[2].oem, "OEM not specified");
  assert.match(rows[2].requests[0].complaint, /Equipment master/);
});

test("date ranges include carried-over breakdowns and closures within the range using IST", () => {
  const rows = build({ from: "2026-09-11", to: "2026-09-11" });
  assert.deepEqual(rows.map((row) => row.record.id), [1, 2, 3]);
  assert.equal(rows[0].requests.length, 1);
  assert.deepEqual(build({ from: "2026-09-14", to: "2026-09-14" }).map((row) => row.record.id), [1, 4]);
  assert.equal(build({ from: "2026-09-15", to: "2026-09-01" }).length, 0);
});

test("range boundaries exclude closure at midnight, future starts and invalid/undated records", () => {
  const rows = build({ equipment: [], from: "2026-09-14", to: "2026-09-14", requests: [
    { ref: "A", start: "2026-09-10 10:00", status: "Closed", closedAt: "2026-09-13T18:30:00Z" },
    { ref: "B", start: "2026-09-14 00:00", status: "Open" },
    { ref: "C", start: "2026-09-15 00:00", status: "Open" },
    { ref: "D", start: "invalid", status: "Open" },
  ] });
  assert.deepEqual(rows.flatMap((row) => row.requests.map((request) => request.ref)), ["B"]);
  assert.ok(oemDateRangeError("2026-09-14", "2026-09-12"));
});

test("all sites appear, OEM spelling is normalized and every site/OEM count reconciles with drilldown", () => {
  const chart = buildOemBreakdownChart({ rows: build(), equipment, regions });
  assert.equal(chart.sites.length, 3);
  assert.equal(chart.sites[1].total, 0);
  assert.equal(chart.oems.filter((item) => item.key === "tata").length, 1);
  assert.equal(chart.rows.length, chart.sites.reduce((sum, site) => sum + site.total, 0));
  for (const site of chart.sites) {
    assert.equal(selectOemBreakdownRows(chart.rows, { site: site.name }).length, site.total);
    for (const segment of site.segments) assert.equal(selectOemBreakdownRows(chart.rows, { site: site.name, oem: segment.key }).length, segment.rows.length);
  }
  const tata = buildOemBreakdownChart({ rows: build(), equipment, regions, oem: "tata" });
  assert.equal(tata.rows.length, 1);
  assert.equal(tata.sites[0].total, 1);
  assert.equal(tata.sites[2].total, 0);
});

test("each OEM has one bar even when it contains several equipment groups", () => {
  const groupedEquipment = [
    { id: 10, door: "A", make: "Tata", group: "Excavator", currentLocation: "Sasti OB" },
    { id: 11, door: "B", make: "Tata", group: "Tipper", currentLocation: "Sasti OB" },
    { id: 12, door: "C", make: "Tata", group: "  tipper  ", currentLocation: "Sasti OB" },
    { id: 13, door: "D", make: "Komatsu", group: "Dozer", currentLocation: "Sasti OB" },
  ];
  const groupedRows = build({ equipment: groupedEquipment, requests: groupedEquipment.map(record => ({ ref: record.door, door: record.door, site: record.currentLocation, status: "Open" })) });
  const chart = buildOemBreakdownChart({ rows: groupedRows, equipment: groupedEquipment, regions });
  const site = chart.sites[0];
  assert.deepEqual(site.bars.map(bar => [bar.label, bar.rows.length]), [
    ["Komatsu", 1],
    ["Tata", 3],
  ]);
  assert.deepEqual(site.bars.map(bar => [bar.label, bar.categorySegments.map(segment => [segment.equipmentGroup, segment.rows.length])]), [
    ["Komatsu", [["DOZER", 1]]],
    ["Tata", [["EXCAVATOR", 1], ["TIPPER", 2]]],
  ]);
  for (const bar of site.bars) {
    const selected = createOemBreakdownSelection(chart, { site: site.name, oem: bar.key });
    assert.equal(selected.rows.length, bar.rows.length);
    assert.ok(selected.rows.every(row => row.oemKey === bar.key));
    for (const segment of bar.categorySegments) {
      const category = createOemBreakdownSelection(chart, { site: site.name, oem: bar.key, equipmentGroup: segment.equipmentGroupKey, equipmentGroupLabel: segment.equipmentGroup });
      assert.equal(category.rows.length, segment.rows.length);
      assert.equal(category.equipmentGroupLabel, segment.equipmentGroup);
      assert.ok(category.rows.every(row => row.equipmentGroupKey === segment.equipmentGroupKey));
    }
  }
});

test("every OEM equipment category has a separate label and colour", () => {
  const groupedEquipment = [
    { id: 20, door: "A", make: "Volvo", group: "Volvo Equipment", currentLocation: "Sasti OB", status: "Breakdown" },
    { id: 21, door: "B", make: "Volvo", group: "Volvo Tipper", currentLocation: "Sasti OB", status: "Breakdown" },
    { id: 22, door: "C", make: "Tata", group: "Tipper", currentLocation: "Sasti OB", status: "Breakdown" },
  ];
  const rows = build({ equipment: groupedEquipment, requests: [] });
  const chart = buildOemBreakdownChart({ rows, equipment: groupedEquipment, regions });
  assert.deepEqual(chart.categories.map((category) => category.label), ["Tata TIPPER", "VOLVO EQUIPMENT", "VOLVO TIPPER"]);
  assert.equal(new Set(chart.categories.map((category) => category.color)).size, chart.categories.length);
  for (const bar of chart.sites[0].bars) for (const segment of bar.categorySegments) {
    assert.equal(segment.color, chart.categories.find((category) => category.key === segment.key).color);
  }
});

test("unknown OEMs and sites keep unmatched requests visible and repeated requests share one asset", () => {
  const rows = build({ equipment: [], requests: [
    { ref: "A", door: "unknown-1", site: "New site", status: "Open" },
    { ref: "B", door: "unknown-1", site: "New site", status: "Open" },
  ] });
  const chart = buildOemBreakdownChart({ rows, regions });
  assert.equal(chart.rows.length, 1);
  assert.equal(chart.rows[0].requests.length, 2);
  assert.equal(chart.sites.at(-1).name, "New site");
});

test("a physical identifier takes precedence over a shared equipment group", () => {
  const rows = build({ equipment: [
    { id: 1, equipmentName: "Tipper", chassisNo: "C1", make: "Tata" },
    { id: 2, equipmentName: "Tipper", chassisNo: "C2", make: "Komatsu" },
  ], requests: [{ ref: "A", chassis: "C2", equipment: "Tipper", status: "Open" }] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].record.id, 2);
});

test("unregistered assets with the same door at different sites remain separate", () => {
  const rows = build({ equipment: [], requests: [
    { ref: "A", door: "V1", site: "Sasti OB", status: "Open" },
    { ref: "B", door: "V1", site: "Jayant OB", status: "Open" },
    { ref: "C", door: "V1", site: "Sasti OB", status: "Open" },
  ] });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => [row.site, row.requests.length]), [["Sasti OB", 2], ["Jayant OB", 1]]);
});

test("empty and scoped inputs cannot add other regions' breakdown records", () => {
  assert.equal(buildOemBreakdownChart().rows.length, 0);
  const scoped = build({ equipment: equipment.filter((row) => row.currentLocation === "Jayant OB"), requests: requests.filter((row) => row.site === "Jayant OB") });
  const chart = buildOemBreakdownChart({ rows: scoped, regions: [regions[1]] });
  assert.deepEqual(chart.sites.map((site) => site.name), ["Jayant OB"]);
  assert.equal(chart.rows.length, 1);
});

test("repeated identifiers on one asset match without a site, while ambiguous group names do not guess an asset", () => {
  const matched = build({ equipment: [{ id: 1, door: "E1", equipmentName: "E1", make: "Tata" }], requests: [{ ref: "A", door: "E1", status: "Open" }] });
  assert.equal(matched[0].oem, "Tata");
  assert.equal(matched[0].record.id, 1);
  const ambiguous = build({ equipment: [
    { id: 1, door: "V1", equipmentName: "Tipper", currentLocation: "Sasti OB", make: "Tata" },
    { id: 2, door: "V2", equipmentName: "Tipper", currentLocation: "Sasti OB", make: "Komatsu" },
  ], requests: [{ ref: "B", equipment: "Tipper", door: "Missing vehicle", site: "Sasti OB", status: "Open" }] });
  assert.equal(ambiguous.length, 1);
  assert.equal(ambiguous[0].oem, "OEM not specified");
  assert.equal(ambiguous[0].requests[0].ref, "B");
});

test("OEM BD uses the production status snapshot and does not revive stale imported off-road status", () => {
  const rows = build({ equipment: [
    { id: 1, door: "E1", make: "Tata", status: "Breakdown", dashboardRoadStatus: "onroad" },
    { id: 2, door: "E2", make: "Komatsu", status: "Operational", dashboardRoadStatus: "offroad" },
  ], requests: [] });
  assert.deepEqual(rows.map((row) => row.record.id), [2]);
  assert.equal(rows[0].requests[0].status, "Off road");
});

test("OEM dashboard sits between Total and Breakdown and shares the existing filters and complete request table", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.ok(source.includes('[["total", "Total"], ["oem", "OEM BD"], ["breakdown", "Breakdown"]]'));
  assert.ok(source.includes('const oemFrom = oemLive ? "" : dashboardFrom;'));
  assert.ok(source.includes('const oemTo = oemLive ? "" : dashboardTo;'));
  assert.ok(source.includes('regions: fleetRegionInsights, oem: dashboardOem'));
  assert.ok(source.includes('<select aria-label="OEM"'));
  assert.match(source, /<OemBreakdownDetails[^>]+selection=\{oemDrilldown\}/);
  const details = readFileSync(new URL("../src/oem-breakdown-details.jsx", import.meta.url), "utf8");
  assert.ok(details.includes('<DashboardRecordBrowser'));
  assert.ok(details.includes('requestRecords={!selection.fleetOnly}'));
  assert.ok(details.includes('showDateFilter={false} showRowNumbers'));
});

test("OEM colours never cycle and stay consistent between the legend, site segments and filters", () => {
  const catalogue = Array.from({length: 40}, (_, id) => ({id, make: `OEM ${String(id).padStart(2, "0")}`, door: `V${id}`, currentLocation: "Sasti OB", status: "Breakdown"}));
  const rows = build({equipment: catalogue, requests: []});
  const all = buildOemBreakdownChart({rows, equipment: catalogue, regions});
  assert.equal(new Set(all.oems.map(oem => oem.color)).size, 40);
  assert.equal(new Set(all.categories.map(category => category.color)).size, 40);
  for (const oem of all.oems) {
    const filtered = buildOemBreakdownChart({rows, equipment: catalogue, regions, oem: oem.key});
    assert.equal(filtered.sites[0].segments[0].color, oem.color);
    assert.equal(filtered.oems.find(item => item.key === oem.key).color, oem.color);
  }
});

test("OEM selections retain every linked request and do not change when the live chart refreshes", () => {
  const chart = buildOemBreakdownChart({rows: build(), equipment, regions});
  const selected = createOemBreakdownSelection(chart, {site: "Sasti OB", oem: "tata"});
  assert.equal(selected.rows.length, 1);
  assert.equal(selected.label, "Tata");
  assert.deepEqual(selected.records.map(record => record.requestReference), ["BD1", "BD2"]);
  assert.ok(selected.records.every(record => record.make === "Tata" && record.requestSite === "Sasti OB"));
  assert.equal(selected.records[0].requestDetails.complaint, "Hydraulics");
  chart.rows = [];
  assert.equal(selected.records.length, 2);
  const filtered = buildOemBreakdownChart({rows: build(), equipment, regions, oem: "komatsu"});
  assert.equal(createOemBreakdownSelection(filtered).label, "Komatsu");
});
