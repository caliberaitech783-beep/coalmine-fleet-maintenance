import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");

test("region metrics and equipment details share live request-based road status", () => {
  const equipmentSource = source.slice(source.indexOf("function Equipment({"), source.indexOf("function EquipmentForm"));
  const regionSource = source.slice(source.indexOf("function RegionMasterPage"), source.indexOf("Generic = function GenericWithMasters"));

  assert.match(regionSource, /function RegionMasterPage\(\{ records = \[\], requests = \[\]/);
  assert.match(regionSource, /const siteRequests = requests\.filter/);
  assert.match(regionSource, /liveEquipmentMetrics\(siteRecords, siteRequests\)/);
  assert.match(equipmentSource, /const roadStatusFor = \(record\) => Array\.isArray\(statusRequests\)/);
  assert.match(equipmentSource, /roadStatusFor\(v\) === road/);
  assert.match(equipmentSource, /!location \|\| recordBelongsToSite\(v, location\)/);
  assert.match(source, /<Equipment[\s\S]*statusRequests=\{requests\}[\s\S]*<Subsidiaries gotoEquipment=\{gotoEquipment\} requests=\{requests\} \/>/);
});
