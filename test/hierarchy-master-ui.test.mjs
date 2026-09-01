import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("hierarchy master renders report-wise and site-wise tick matrix", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
  const hierarchySource = source.slice(source.indexOf("function HierarchyMasterPage"), source.indexOf("function RegionMasterPage"));

  assert.match(source, /function HierarchyMasterPage\(/);
  assert.match(source, /<HierarchyMasterPage records=\{records\}/);
  assert.match(hierarchySource, /Hierarchy Key Whatsapp Flow/);
  assert.match(hierarchySource, /Designation-wise WhatsApp report matrix/);
  assert.match(hierarchySource, /hierarchyReportGroups\.map/);
  assert.match(hierarchySource, /hierarchyReportTitles\.map/);
  assert.match(hierarchySource, /WCL and NCL site wise ticks/);
  assert.match(hierarchySource, /hierarchySiteGroups\.flatMap/);
  assert.match(hierarchySource, /hierarchySiteTitles/);
  assert.doesNotMatch(hierarchySource, /activeRegion\?\.sites/);
  assert.match(hierarchySource, /toggleReport/);
  assert.match(hierarchySource, /toggleSite/);
  assert.match(source, /reportAccess/);
  assert.match(source, /siteAccess/);
  assert.match(styles, /\.hierarchy-master-page/);
  assert.match(styles, /\.hierarchy-matrix/);
  assert.match(styles, /\.hierarchy-report-legend/);
});
