import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("region master renders WCL and NCL graphical tabs with site subtabs", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
  const regionSource = source.slice(source.indexOf("function RegionMasterPage"), source.indexOf("Generic = function GenericWithMasters"));

  assert.match(source, /function RegionMasterPage\(/);
  assert.match(source, /Subsidiaries = function SubsidiariesWithImport\(props = \{\}\)/);
  assert.match(source, /<RegionMasterPage records=\{records\}/);
  assert.match(source, /gotoEquipment=\{props\.gotoEquipment\}/);
  assert.match(regionSource, /className="region-main-tabs"/);
  assert.match(regionSource, /role="tablist" aria-label="Region tabs"/);
  assert.match(regionSource, /className="region-site-tabs"/);
  assert.match(regionSource, /aria-label=\{`\$\{activeRegion\.code\} site tabs`\}/);
  assert.match(regionSource, /WCL and NCL site control center/);
  assert.match(regionSource, /Total equipment \/ vehicle/);
  assert.match(regionSource, /On Road/);
  assert.match(regionSource, /Off Road/);
  assert.match(regionSource, /Idle/);
  assert.match(styles, /\.region-master-page/);
  assert.match(styles, /\.region-main-tabs/);
  assert.match(styles, /\.region-site-tabs/);
  assert.match(styles, /\.region-site-metrics/);
});
