import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const client = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("dashboard vehicle composition shows every equipment group", () => {
  assert.match(client, /const vehicleTypes = Object\.entries\(typeCounts\)\.sort\(\(a, b\) => b\[1\] - a\[1\]\);/);
  assert.doesNotMatch(client, /const vehicleTypes = [^;]*\.slice\(0, 4\)/);
  assert.match(client, /openAssetDrilldown\(`group:\$\{label\}`\)/);
  assert.match(client, /equipmentGroupLabel\(record\) === key\.slice\(6\)/);
});
