import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("Production Request card contains only Production and Maintenance created requests", () => {
  assert.match(source, /production: locationBreakdowns\.filter\(\(record\) => \["production user", "maintenance user"\]\.includes\(String\(record\.requesterRole \|\| ""\)\.trim\(\)\.toLowerCase\(\)\)/);
  assert.match(source, /requestEventDate\(record, "opened"\) >= safeTrendStartKey && requestEventDate\(record, "opened"\) <= requestTrendEndKey/);
  assert.match(source, /label: "Production Request", note: "Production \+ Maintenance", value: requestLifecycleRows\.production\.length/);
  assert.match(source, /openAssetDrilldown\(`event:\$\{item\.key\}`\)/);
  assert.doesNotMatch(source, /label: "Opened", note: "New requests"/);
});
