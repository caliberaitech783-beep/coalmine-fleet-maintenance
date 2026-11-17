import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalSiteName, recordBelongsToSite } from "../site-location.mjs";
import { requestDateKey } from "../src/dashboard-request-data.mjs";
import { newCategoryMixRequests } from "../dashboard-breakdown-movement.mjs";
import { createFleetAssetResolver } from "../dashboard-equipment-metrics.mjs";

const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const dashboard = main.slice(main.indexOf("function Dashboard("), main.indexOf("\nfunction ResponsibilityHistoryCell("));

test("cached site names give the same answer on every call, including after the cache limit", () => {
  const spellings = { "Sasti OC": "sasti ob", " SASTI ": "sasti ob", "Jayant OB (2nd)": "jayant ob", "Dudhichua West": "dudhichua ob", "Majri O.B": "majri ob", "": "" };
  for (let round = 0; round < 3; round++) {
    for (const [input, expected] of Object.entries(spellings)) assert.equal(canonicalSiteName(input), expected);
  }
  assert.equal(canonicalSiteName(null), "");
  assert.equal(canonicalSiteName(undefined), "");
  // Push well past the cap; answers stay correct after the cache is cleared.
  for (let index = 0; index < 12_000; index++) assert.equal(canonicalSiteName(`Site ${index} OC`), `site ${index} ob`);
  for (const [input, expected] of Object.entries(spellings)) assert.equal(canonicalSiteName(input), expected);
  assert.equal(recordBelongsToSite({ currentLocation: "Sasti OC" }, "Sasti OB"), true);
  assert.equal(recordBelongsToSite({ currentLocation: "Majri OB" }, "Sasti OB"), false);
});

test("cached request days match the uncached rules and Date objects are never cached", () => {
  for (let round = 0; round < 3; round++) {
    assert.equal(requestDateKey("2026-09-08T18:29:59.999Z"), "2026-09-08");
    assert.equal(requestDateKey("2026-09-08T18:30:00Z"), "2026-09-09");
    assert.equal(requestDateKey("2026-09-08"), "2026-09-08");
    assert.equal(requestDateKey("not a date"), "");
    assert.equal(requestDateKey(""), "");
  }
  const moving = new Date("2026-09-08T18:30:00Z");
  assert.equal(requestDateKey(moving), "2026-09-09");
  moving.setUTCDate(20);
  assert.equal(requestDateKey(moving), "2026-09-21", "a changed Date object is re-read, not served from cache");
  for (let index = 0; index < 60_000; index++) requestDateKey(`2026-01-01T00:00:${String(index % 60).padStart(2, "0")}.${index % 1000}Z#${index}`);
  assert.equal(requestDateKey("2026-09-08T18:30:00Z"), "2026-09-09");
});

test("the category-mix cut-off still splits requests by creation time on repeated calls", () => {
  const rows = [
    { ref: "OLD", createdAt: "2026-10-29T08:29:59Z", category: "TYRE SYSTEM", classification: { version: 1, repairType: "Breakdown", breakdownCategory: "TYRE SYSTEM" } },
    { ref: "NEW", createdAt: "2026-10-29T08:30:00Z", category: "TYRE SYSTEM", classification: { version: 1, repairType: "Breakdown", breakdownCategory: "TYRE SYSTEM" } },
    { ref: "BAD", createdAt: "yesterday" },
    { ref: "DATE", createdAt: new Date("2026-11-01T00:00:00Z") },
  ];
  for (let round = 0; round < 3; round++) {
    assert.deepEqual(newCategoryMixRequests(rows, "all").map((row) => row.ref), ["NEW", "DATE"]);
    assert.deepEqual(newCategoryMixRequests(rows).map((row) => row.ref), ["NEW"]);
    assert.deepEqual(newCategoryMixRequests(rows, "pending").map((row) => row.ref), ["DATE"]);
  }
});

test("asset matching by door and chassis is unchanged with cached identity text", () => {
  const resolve = createFleetAssetResolver([
    { door: "V-1", chassisNo: "CH 001", currentLocation: "Sasti OC" },
    { door: "V-2", chassisNo: "CH-002", currentLocation: "Sasti OC" },
  ]);
  for (let round = 0; round < 3; round++) {
    assert.equal(resolve({ chassis: "ch001", site: "Sasti OB" }).assetIndex, 0);
    assert.equal(resolve({ door: "v 2", site: "Sasti OB" }).assetIndex, 1);
    assert.equal(resolve({ door: "V-9", site: "Sasti OB" }).assetIndex, null);
  }
});

test("the dashboard keeps its heavy fleet calculations cached between redraws", () => {
  for (const [name, deps] of [
    ["visibleLmv", "lmvFleet.records, selectedRegion, dashboardSite"],
    ["combinedFleetOemRecords", "visibleEquipment, liveBreakdowns"],
    ["combinedFleetRecords", "visibleEquipment, liveBreakdowns, combinedFleetOemRecords"],
    ["combinedFleetCounts", "combinedFleetRecords"],
    ["oemBreakdownRows", "scopedEquipment, scopedBreakdowns, oemFrom, oemTo"],
  ]) {
    assert.match(dashboard, new RegExp(`const ${name} = useMemo\\(\\(\\) => [^\\n]*, \\[${deps.replace(/\./g, "\\.")}\\]\\);`), `${name} is memoised on its inputs`);
  }
  assert.match(dashboard, /const fleetRegionInsights = useMemo\(\(\) => availableRegions\n/);
  assert.match(dashboard, /\.filter\(region => region\.sites\.length > 0\), \[availableRegions, selectedRegion, normalizedAllowedSites, dashboardSite, scopedEquipment, liveBreakdowns, visibleLmv, hasLmvFleet, combinedFleetRecords\]\);/);
});

test("the stage pipeline works out each request's stage once instead of per site and stage", () => {
  assert.match(dashboard, /const stagePipelineStageOf = new Map\(stagePipelineRequests\.map\(\(record\) => \[record, stagePipelineRequestStage\(record\)\]\)\);/);
  assert.match(dashboard, /const stagePipelineTotals = stagePipelineCounts\(stagePipelineRequests\);/);
  assert.doesNotMatch(dashboard, /stagePipelineRequests\.filter\(\(record\) => [^\n]*stagePipelineRequestStage\(record\) === stage\.key\)/);
});
