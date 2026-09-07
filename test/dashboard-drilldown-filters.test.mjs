import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { REGION_DATA } from "../region-scope.mjs";
import { changeDrilldownFilter, drilldownView } from "../src/dashboard-drilldown-model.mjs";

const rows = [
  { id: 1, currentLocation: "SASTI II", category: "Vehicle", group: "SCANIA TIPPERS", door: "T01" },
  { id: 2, currentLocation: "Sasti OB", category: "Equipment", group: "EXCAVATOR", door: "E01" },
  { id: 3, currentLocation: "Majri OB", category: "Vehicle", group: "VOLVO TIPPERS", door: "T02" },
  { id: 4, currentLocation: "Jayant OB", category: "Equipment", group: "DOZER", door: "D01" },
];
const ids = (view) => view.rows.map(({ id }) => id);
const values = (options) => options.map(({ value }) => value);

test("opening a chart immediately lists every record for the initial region", () => {
  const view = drilldownView(rows, REGION_DATA);
  assert.deepEqual(view.regions.map(({ code, rows }) => [code, rows.length]), [["WCL", 3], ["NCL", 1]]);
  assert.deepEqual(ids(view), [1, 2, 3]);
  assert.deepEqual(values(view.options.site), ["Sasti OB", "Majri OB"]);
  assert.equal(view.regionTotal, 3);
  assert.deepEqual(ids(drilldownView(rows, REGION_DATA, { region: "NCL" })), [4]);
});

test("site, category, type and machine options cascade from the preceding selection", () => {
  let filters = { region: "WCL", site: "Sasti OB" };
  let view = drilldownView(rows, REGION_DATA, filters);
  assert.deepEqual(ids(view), [1, 2]);
  assert.deepEqual(values(view.options.group), ["EXCAVATOR", "SCANIA TIPPERS"]);
  filters = changeDrilldownFilter(view.selection, "category", "Total vehicles");
  view = drilldownView(rows, REGION_DATA, filters);
  assert.deepEqual(ids(view), [1]);
  assert.deepEqual(values(view.options.group), ["SCANIA TIPPERS"]);
  assert.deepEqual(values(view.options.machine), ["T01"]);
  filters = changeDrilldownFilter(view.selection, "group", "SCANIA TIPPERS");
  filters = changeDrilldownFilter(filters, "machine", "T01");
  assert.deepEqual(ids(drilldownView(rows, REGION_DATA, filters)), [1]);
  assert.deepEqual(ids(drilldownView(rows, REGION_DATA, changeDrilldownFilter(filters, "site", "Majri OB"))), [3]);
});

test("changing a parent resets all descendants without clearing its parents", () => {
  const selected = { region: "WCL", site: "Sasti OB", category: "Total vehicles", group: "SCANIA TIPPERS", machine: "T01" };
  assert.deepEqual(changeDrilldownFilter(selected, "category", "Total equipment"), { ...selected, category: "Total equipment", group: "", machine: "" });
  const changedRegion = changeDrilldownFilter(selected, "region", "NCL");
  assert.deepEqual(changedRegion, { region: "NCL", site: "", category: "", group: "", machine: "" });
  const view = drilldownView(rows, REGION_DATA, changedRegion);
  assert.deepEqual(ids(view), [4]);
  assert.deepEqual(values(view.options.site), ["Jayant OB"]);
});

test("empty regions stay selectable and default opening prefers a populated region", () => {
  const nclOnly = rows.slice(3);
  assert.equal(drilldownView(nclOnly, REGION_DATA).selection.region, "NCL");
  const empty = drilldownView(nclOnly, REGION_DATA, { region: "WCL" });
  assert.equal(empty.selection.region, "WCL");
  assert.deepEqual(ids(empty), []);
  assert.deepEqual(empty.options, { site: [], category: [], group: [], machine: [] });
});

test("a changed data set clears invalid filters and keeps every remaining regional row", () => {
  const view = drilldownView(rows.slice(2), REGION_DATA, { region: "WCL", site: "Sasti OB", category: "Total equipment", group: "EXCAVATOR" });
  assert.deepEqual(ids(view), [3]);
  assert.deepEqual(view.selection, { region: "WCL", site: "", category: "", group: "", machine: "" });
});

test("region and site access scope cannot be broadened by filter selection", () => {
  const scope = [{ code: "WCL", sites: ["Sasti OB"] }];
  const view = drilldownView(rows, scope, { region: "NCL", site: "Jayant OB" });
  assert.deepEqual(view.regions.map(({ code }) => code), ["WCL"]);
  assert.deepEqual(ids(view), [1, 2]);
  assert.deepEqual(values(view.options.site), ["Sasti OB"]);
  assert.deepEqual(ids(drilldownView(rows, [])), []);
});

test("request rows stay under their request site even if the equipment has moved", () => {
  const requestRows = [
    { ...rows[0], requestSite: "SASTI II", currentLocation: "Jayant OB", requestReference: "JOB-1" },
    { ...rows[0], id: 5, requestSite: "Sasti OB", currentLocation: "Jayant OB", requestReference: "JOB-2" },
    { id: 6, requestSite: "Majri OB", category: "Unclassified", requestReference: "JOB-3" },
  ];
  const view = drilldownView(requestRows, REGION_DATA);
  assert.deepEqual(ids(view), [1, 5, 6]);
  assert.equal(view.regions.find(({ code }) => code === "NCL").rows.length, 0);
  assert.ok(values(view.options.category).includes("Unclassified"));
});

test("the list is unconditional and tabs support keyboard navigation", () => {
  const component = readFileSync(new URL("../src/dashboard-record-browser.jsx", import.meta.url), "utf8");
  assert.match(component, /role="tablist" aria-label="Chart records by region"/);
  assert.match(component, /role="tabpanel"/);
  assert.match(component, /event\.key === "ArrowRight"/);
  assert.match(component, /<ActionsTable key=\{tableKey\}>/);
  assert.match(component, /view\.rows\.length \? view\.rows\.map/);
  assert.match(component, /\["site", "Site", "All sites"\]/);
  assert.doesNotMatch(component, /Step [1-5]/);
});
