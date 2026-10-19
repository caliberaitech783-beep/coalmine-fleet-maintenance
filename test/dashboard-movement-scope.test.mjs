import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { movementRequestRows } from "../src/dashboard-card-actions.mjs";
import { dailyBdRecordsForMetric } from "../src/daily-bd-balance.mjs";
import { drilldownView } from "../src/dashboard-drilldown-model.mjs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const pickerSource = source.slice(source.indexOf('  const rowsForAssetDrilldown ='), source.indexOf('  // Drilldown keys whose rows'));
const regions = [{ code: "NCL", sites: ["Jayant OC", "Nigahi OC", "Dudhichua OC"] }, { code: "WCL", sites: ["Majri OC"] }];
const requests = [
  ...Array.from({ length: 24 }, (_, id) => ({ id, site: "Jayant OC", status: "Open", start: "2026-10-18 09:00:00" })),
  ...Array.from({ length: 7 }, (_, id) => ({ id: 100 + id, site: "Nigahi OC", status: "Open", start: "2026-10-18 09:00:00" })),
  { id: 200, site: "Majri OC", status: "Open", start: "2026-10-18 09:00:00" },
  { id: 300, site: "Jayant OC", status: "Closed", start: "2026-10-17 09:00:00", closedAt: "2026-10-18 10:00:00" },
];
const picker = records => new Function("throughputRequests", "locationBreakdowns", "requestAssetRows", "movementRequestRowsForShift", "dailyBdRecordsForMetric", "requestMatchesMovementShift", "requestDateKey",
  `${pickerSource}; return rowsForAssetDrilldown;`)(records, records, rows => rows.map(row => ({ ...row, requestSite: row.site })), movementRequestRows, dailyBdRecordsForMetric, () => true, value => String(value || "").slice(0, 10));

test("clicked Jayant movement and daily balance retain 24 rows, NCL includes its other sites", () => {
  for (const prefix of ["movement", "balance"]) {
    const rows = picker(requests)(`${prefix}:open|2026-10-19|2026-10-19|Jayant OC`);
    const options = { rowsAreScoped: true, includeEmptySites: true };
    const selected = drilldownView(rows, regions, { region: "NCL", site: "Jayant OC" }, options);
    assert.equal(selected.rows.length, 24);
    assert.equal(selected.regionTotal, 31);
    assert.equal(selected.regions.find(region => region.code === "all").rows.length, 32);
    assert.deepEqual(selected.options.site.map(option => [option.value, option.count]), [["Dudhichua OC", 0], ["Jayant OC", 24], ["Nigahi OC", 7]]);
    assert.equal(drilldownView(rows, regions, { region: "NCL" }, options).rows.length, 31);
    assert.equal(drilldownView(rows, regions, { region: "NCL", site: "Nigahi OC" }, options).rows.length, 7);
    const empty = drilldownView(rows, regions, { region: "NCL", site: "Dudhichua OC" }, options);
    assert.equal(empty.rows.length, 0);
    assert.equal(empty.selection.site, "Dudhichua OC");
  }
});

test("movement navigation never loads beyond the caller's authorized dashboard snapshot", () => {
  const allowed = requests.filter(row => row.site === "Jayant OC");
  const rows = picker(allowed)("movement:open|2026-10-19|2026-10-19|Jayant OC");
  const view = drilldownView(rows, [{ code: "NCL", sites: ["Jayant OC"] }], { region: "NCL" }, { rowsAreScoped: true, includeEmptySites: true });
  assert.equal(view.rows.length, 24);
  assert.deepEqual(view.options.site.map(option => option.value), ["Jayant OC"]);
  assert.match(source, /const records = throughputRequests;/);
  assert.match(source, /const records = locationBreakdowns;/);
  assert.match(source, /includeEmptySites=\{movementDrilldown\} onScopeChange=\{movementDrilldown \? updateMovementBrowseScope : null\}/);
});

test("an empty search result keeps the selected authorized site instead of showing another site's rows", () => {
  const view = drilldownView([], regions, { region: "NCL", site: "Jayant OC" }, { rowsAreScoped: true, includeEmptySites: true });
  assert.equal(view.selection.site, "Jayant OC");
  assert.equal(view.rows.length, 0);
  assert.equal(view.options.site.length, 3);
});

test("the movement title and exports follow navigation, preserving that scope when dates change", () => {
  assert.match(source, /const movementScopeLabel = initialDrilldownSite/);
  assert.match(source, /const movementDrilldownTitle = movementDrilldownParts.length \? `\$\{movementScopeLabel\}/);
  assert.match(source, /setMovementBrowseScope\(\{ key, region: initialDrilldownRegion, site: initialDrilldownSite \}\)/);
  assert.match(source, /const openBreakdownDay =[\s\S]*?setMovementBrowseScope\(null\)/);
});
