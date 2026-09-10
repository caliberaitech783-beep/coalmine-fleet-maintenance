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

test("site breakdown movement includes every request category in the selected scope", () => {
  assert.match(client, /const locationBreakdowns = selectedRegion \? scopedBreakdowns\.filter/);
  assert.match(client, /const throughputRequests = locationBreakdowns\.filter\(inThroughputScope\)/);
  assert.match(client, /const siteRequests = throughputRequests\.filter/);
  assert.match(client, /breakdownMovementForRange\(siteRequests, breakdownSummaryStartKey, breakdownSummaryEndKey\)/);
  assert.doesNotMatch(client, /locationBreakdowns\.filter\(.*category/);
});
