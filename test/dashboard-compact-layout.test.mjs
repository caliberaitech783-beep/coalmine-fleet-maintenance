import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync(
  new URL("../src/dashboard-concept-a.css", import.meta.url),
  "utf8",
);

test("dashboard KPI cards use a compact responsive grid", () => {
  assert.match(css, /Compact command-centre density/);
  assert.match(
    css,
    /\.mine-counter-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(145px,\s*1fr\)\);[\s\S]*?grid-auto-rows:\s*49px;/,
  );
  assert.match(
    css,
    /@media \(max-width:\s*1100px\)[\s\S]*?\.mine-counter-grid\s*\{\s*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/,
  );
  assert.match(
    css,
    /@media \(max-width:\s*700px\)[\s\S]*?\.mine-counter-grid\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/,
  );
});

test("dashboard overview cards reserve a compact stable chart area", () => {
  assert.match(
    css,
    /\.mine-overview-chart-body\s*\{[\s\S]*?min-height:\s*96px;[\s\S]*?padding:\s*8px 12px;/,
  );
  assert.match(
    css,
    /\.mine-overview-donut\s*\{[\s\S]*?width:\s*82px;[\s\S]*?height:\s*82px;/,
  );
});
