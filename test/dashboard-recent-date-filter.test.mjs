import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/style.css", import.meta.url), "utf8");

test("dashboard replaces recent cases with a site-wise selectable breakdown trend", () => {
  assert.doesNotMatch(source, /<BreakdownTable rows=\{visibleBreakdowns\} showMakeModel showDateFilter rowLimit=\{5\} \/>/);
  assert.match(source, /className="mine-panel mine-breakdown-trend mine-custom-widget"/);
  assert.match(source, /\[breakdownTrendDays, setBreakdownTrendDays\] = useState\(7\)/);
  assert.match(source, /\[breakdownTrendSite, setBreakdownTrendSite\] = useState\("all"\)/);
  assert.match(source, /\[7, 14, 30\]\.map/);
  assert.match(source, /aria-label="Breakdown trend site"/);
  assert.match(source, /breakdownTrendSites\.map/);
  assert.match(source, /showDateFilter = false, rowLimit = 0/);
  assert.match(source, /\[dateFilter, setDateFilter\] = useState\(""\)/);
  assert.match(source, /dashboardRecordDate\(row\) === dateFilter/);
  assert.match(source, /rowLimit > 0 && !dateFilter \? dateFilteredRows\.slice\(0, rowLimit\) : dateFilteredRows/);
});

test("breakdown toolbar renders and clears the date control", () => {
  assert.match(source, /className="table-date-filter"><CalendarDays \/><input aria-label="Filter by started date" type="date"/);
  assert.match(source, /setParameterFilters\(\{\}\); setStatusFilter\(""\); setDateFilter\(""\);/);
  assert.match(styles, /\.table-search-toolbar \.table-date-filter\{flex:0 1 190px;min-width:170px\}/);
});
