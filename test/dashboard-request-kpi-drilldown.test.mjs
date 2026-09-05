import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("operational dashboard graphs open category, group, lifecycle, and full-detail drilldowns", () => {
  assert.match(source, /openAssetDrilldown\(`repair:\$\{label\}`\)/);
  assert.doesNotMatch(source, /className="mine-panel mine-open-cases"/);
  assert.match(source, /fleetChartMode === "total" \? "site" : "offroad-site"/);
  assert.match(source, /key: `group:\$\{group\.label\}`/);
  assert.match(source, /openAssetDrilldown\(`event:\$\{item\.key\}`\)/);
  assert.match(source, /openAssetDrilldown\(`event:\$\{event\}:\$\{day\.date\}`\)/);
  assert.match(source, /Step 1 · Select equipment category/);
  assert.match(source, /Step 2 · Select equipment group/);
  assert.match(source, /Step 3 · Full details for/);
});

test("request KPI drilldowns merge job fields with Equipment Master details", () => {
  assert.match(source, /const requestAssetRows = \(requestRows = \[\]\)/);
  assert.match(source, /const equipment = equipmentForRequest\(request\)/);
  assert.match(source, /requestReference: request\.ref \|\| request\.reference/);
  assert.match(source, /requestAssetDrilldown && <th>Job reference<\/th>/);
  assert.match(source, /<th>Repair category<\/th><th>Status<\/th><th>Started<\/th>/);
  assert.match(source, /<Status>\{record\.requestStatus\}<\/Status>/);
});

test("repair type graph drills down by region, site, fleet category, and type before request details", () => {
  assert.match(source, /const repairTypeSiteDrilldown = assetDrilldown\.startsWith\("repair:"\)/);
  assert.match(source, /const repairTypeRegionBreakdown = availableRegions/);
  assert.match(source, /const selectedRepairTypeRegion = repairTypeRegionBreakdown\.find/);
  assert.match(source, /Step 1 · Select region/);
  assert.match(source, /setAssetDrilldownRegion\(region\.code\)/);
  assert.match(source, /Step 2 · Select \{selectedRepairTypeRegion\.code\} site/);
  assert.match(source, /const repairTypeSiteBreakdown = \(selectedRepairTypeRegion\?\.sites \|\| \[\]\)\.map/);
  assert.match(source, /assetDrilldownRows\.filter\(\(record\) => recordBelongsToSite\(record, site\)\)/);
  assert.match(source, /setAssetDrilldownSite\(site\)/);
  assert.match(source, /const repairTypeSiteCategoryBreakdown = summarizeEquipment\(repairTypeSiteRows, equipmentCategoryLabel\)/);
  assert.match(source, /Step 3 · \{assetDrilldownSite\} fleet totals/);
  assert.match(source, /const repairTypeSiteGroupBreakdown = summarizeEquipment\(repairTypeSiteCategoryRows\)/);
  assert.match(source, /Step 4 · Select \{assetDrilldownCategory === "Total vehicles" \? "vehicle" : "equipment"\} type/);
  assert.match(source, /Step 5 · Request details for \{assetDrilldownGroup\}/);
  assert.match(source, /repairTypeSiteGroupRows\.map/);
  assert.match(source, /aria-label="Back to repair regions"/);
});
