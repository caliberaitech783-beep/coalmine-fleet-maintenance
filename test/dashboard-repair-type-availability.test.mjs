import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const client = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("every authenticated dashboard can read repair types without master management access", () => {
  assert.match(server, /app\.get\('\/api\/reference\/repair-types',requireSession/);
  assert.match(server, /WHERE master_name=\$1[\s\S]*\['Repair type master'\]/);
  assert.match(server, /res\.json\(rows\.map\(\(row\)=>\(\{id:row\.id,repairType:/);
  assert.doesNotMatch(server, /app\.get\('\/api\/reference\/repair-types',requirePermission/);
});

test("maintenance type never renders blank while reference data loads or is unavailable", () => {
  assert.match(client, /const dashboardRepairTypeDefaults = \["Breakdown", "Accidental", "Preventive", "Aggregate Repair", "Super Structure", "WGM"\]/);
  assert.match(client, /function useDashboardRepairTypes\(\)/);
  assert.match(client, /fetch\("\/api\/reference\/repair-types"/);
  assert.match(client, /const \[records, setRecords\] = useState\(fallback\)/);
  assert.match(client, /\.\.\.visibleBreakdowns\.map\(\(record\) => record\.category\)/);
});
