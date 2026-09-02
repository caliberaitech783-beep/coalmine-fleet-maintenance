import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Total Fleet site and region names are bold and readable", async () => {
  const css = await readFile(new URL("../src/dashboard-concept-a.css", import.meta.url), "utf8");

  const siteLabel = css.match(/\.mine-fleet-chart-sites small \{[^}]*\}/);
  assert.ok(siteLabel, "expected the site name rule");
  assert.match(siteLabel[0], /font-size: 11px/);
  assert.match(siteLabel[0], /font-weight: 800/);
  // Bold only reads if the label leaves the muted colour behind.
  assert.match(siteLabel[0], /color: var\(--mine-text\)/);
  // The old fixed 76px box is what clipped "Dhoptala OB (2nd)".
  assert.doesNotMatch(siteLabel[0], /width: 76px/);
  assert.match(siteLabel[0], /width: 100%/);

  const regionCode = css.match(/\.mine-fleet-chart-regions footer b \{[^}]*\}/);
  assert.ok(regionCode, "expected the region code rule");
  assert.match(regionCode[0], /font: 900 14px Manrope/);

  const regionCount = css.match(/\.mine-fleet-chart-regions footer span \{[^}]*\}/);
  assert.ok(regionCount, "expected the region count rule");
  assert.match(regionCount[0], /font-size: 11px/);
  assert.match(regionCount[0], /font-weight: 700/);

  // Nothing in these three rules may fall back to the old 7px.
  for (const rule of [siteLabel[0], regionCode[0], regionCount[0]]) {
    assert.doesNotMatch(rule, /\b7px\b/);
  }
});
