import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizedBreakdownType } from "../dashboard-breakdown-movement.mjs";

test("the breakdown type normaliser is shared so drilldown keys match the type mix", () => {
  // The mix cards and the drilldown filter must agree on the label, or a card
  // opens an empty list.
  assert.equal(normalizedBreakdownType("breakdown"), "Breakdown");
  assert.equal(normalizedBreakdownType("accident"), "Accidental");
  assert.equal(normalizedBreakdownType("PM"), "Preventive");
  assert.equal(normalizedBreakdownType("superstructure"), "Super Structure");
  assert.equal(normalizedBreakdownType("wgm"), "WGM");
  assert.equal(normalizedBreakdownType("something else"), "");
});

test("site-scoped drilldown starts at equipment vs vehicle and runs to machine details", async () => {
  const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");

  // Both key shapes carry the site, so no region or site step is needed.
  assert.match(source, /assetDrilldown\.startsWith\("site-repair:"\) \|\| assetDrilldown\.startsWith\("site-status:"\)/);
  assert.match(source, /if \(key\.startsWith\("site-repair:"\)\)/);
  assert.match(source, /if \(key\.startsWith\("site-status:"\)\)/);
  // "all" keeps every machine at the site; anything else filters by road status.
  assert.match(source, /status === "all" \? atSite : atSite\.filter/);

  // The four steps, in order.
  assert.match(source, /Step 1 · Select equipment or vehicle/);
  assert.match(source, /Step 2 · Select \{assetDrilldownCategory === "Total vehicles" \? "vehicle" : "equipment"\} type/);
  assert.match(source, /Step 3 · Select a machine in \{assetDrilldownGroup\}/);
  assert.match(source, /Step 4 · Full details for \{assetDrilldownMachine\}/);

  // The machine step needs its own state, cleared whenever a parent step changes.
  assert.match(source, /\[assetDrilldownMachine, setAssetDrilldownMachine\] = useState\(""\)/);
  const opener = source.match(/const openAssetDrilldown = \(key\) => \{[\s\S]*?\};/);
  assert.ok(opener, "expected openAssetDrilldown");
  assert.match(opener[0], /setAssetDrilldownMachine\(""\)/);

  // The site-scoped opener must only close the modal and open the drilldown.
  const scoped = source.match(/const openSiteScopedDrilldown = \(key\) => \{[\s\S]*?\};/);
  assert.ok(scoped, "expected openSiteScopedDrilldown");
  assert.match(scoped[0], /openAssetDrilldown\(key\)/);
  // It must not carry over the road-availability body it was inserted beside.
  assert.doesNotMatch(scoped[0], /setRoadFocusSite/);
  assert.doesNotMatch(scoped[0], /setMaintenanceAvailabilityTab/);

  // Request-shaped rows so the details table shows job columns.
  assert.match(source, /requestAssetDrilldown = assetDrilldown === "open-cases" \|\| assetDrilldown\.startsWith\("site-repair:"\)/);
});

test("both maintenance type and road status open the site-scoped drilldown", async () => {
  const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/dashboard-concept-a.css", import.meta.url), "utf8");

  // Maintenance type: the six BD Type Mix cards.
  assert.match(source, /openSiteScopedDrilldown\(`site-repair:\$\{breakdownDetailSite\}\|\$\{type\.label\}`\)/);
  // On-road type: the three road status cards beside them.
  assert.match(source, /openSiteScopedDrilldown\(`site-status:\$\{breakdownDetailSite\}\|\$\{item\.key\}`\)/);
  assert.match(source, /dashboard-breakdown-road-mix/);

  // Cards became buttons, so every type-mix rule must accept a button too or
  // the nth-child colours and dividers silently stop applying.
  assert.doesNotMatch(css, /\.mine-breakdown-type-mix article/);
  assert.match(css, /\.mine-breakdown-type-mix :is\(article, button\)/);
  assert.match(css, /\.mine-breakdown-type-mix button \{[^}]*cursor: pointer/);
});
