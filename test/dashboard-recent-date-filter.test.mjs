import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/style.css", import.meta.url), "utf8");

test("recent breakdown cases enables its local started-date filter", () => {
  assert.match(source, /<BreakdownTable rows=\{visibleBreakdowns\} showMakeModel showDateFilter rowLimit=\{5\} \/>/);
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
