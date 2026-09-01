import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/dashboard-concept-a.css", import.meta.url), "utf8");

test("dashboard region selection exposes its sites and filters every scoped data source", () => {
  assert.match(source, /const \[dashboardSite, setDashboardSite\] = useState\("all"\)/);
  assert.match(source, /const selectedSites = \(selectedRegion\?\.sites \|\| \[\]\)\.filter/);
  assert.match(source, /const activeSites = dashboardSite !== "all" \? \[dashboardSite\] : selectedSites/);
  assert.match(source, /visibleEquipment = selectedRegion \? scopedEquipment\.filter\(\(record\) => activeSites\.some/);
  assert.match(source, /visibleUsers = selectedRegion \? scopedUsers\.filter\(\(record\) => activeSites\.some/);
  assert.match(source, /locationBreakdowns = selectedRegion \? scopedBreakdowns\.filter\(\(record\) => activeSites\.some/);
  assert.match(source, /selectedRegion && <label className="mine-site-filter">/);
  assert.match(source, /<select aria-label="Site" value=\{dashboardSite\}/);
  assert.match(source, /selectedSites\.map\(\(site\) => <option key=\{site\} value=\{site\}>\{site\}<\/option>\)/);
});

test("dashboard date control filters request-based metrics and remains responsive", () => {
  assert.match(source, /function dashboardRecordDate\(record = \{\}\)/);
  assert.match(source, /const \[dashboardDate, setDashboardDate\] = useState\(""\)/);
  assert.match(source, /dashboardDate \? locationBreakdowns\.filter\(\(record\) => dashboardRecordDate\(record\) === dashboardDate\) : locationBreakdowns/);
  assert.match(source, /<input aria-label="Dashboard date" type="date" value=\{dashboardDate\}/);
  assert.match(source, /\{dashboardDate \? "Filtered" : "Live"\} · \{filteredDateLabel\}/);
  assert.match(styles, /\.mine-head-actions\{[^}]*flex-wrap:wrap/);
  assert.match(styles, /\.mine-site-filter select\{min-width:165px\}/);
  assert.match(styles, /@media\(max-width:700px\)[\s\S]*\.mine-head-actions\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
