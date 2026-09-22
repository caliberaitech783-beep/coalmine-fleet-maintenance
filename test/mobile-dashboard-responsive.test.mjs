import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/mobile-phone-optimization.css", import.meta.url), "utf8");

test("the dashboard phone pass stays in the established mobile layer", () => {
  assert.ok(source.includes('import "./mobile-phone-optimization.css"'));
  assert.ok(!source.includes('mobile-dashboard-responsive.css'));
  assert.match(css, /Final dashboard phone pass/);
});

test("phone dashboard chrome cannot widen or cover the page", () => {
  assert.match(css, /\.top\s*\{[\s\S]*?grid-template-columns:\s*36px minmax\(0, 1fr\) auto/);
  assert.match(css, /\.top \.live-temperature-chip,[\s\S]*?display:\s*none/);
  assert.match(css, /\.body > \.mine-dashboard\s*\{[\s\S]*?margin:\s*-18px/);
  assert.match(css, /\.mine-dashboard > \.dashboard-filter-bar\s*\{[\s\S]*?position:\s*static/);
});

test("mobile fleet and lifecycle controls keep labels separated", () => {
  assert.match(css, /\.mine-fleet-chart-toggle\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.mine-request-lifecycle-controls\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media screen and \(max-width: 360px\)[\s\S]*?\.mine-request-lifecycle-controls\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /grid-auto-columns:\s*minmax\(150px, 1fr\)/);
  assert.match(css, /\.mine-request-chart-day > span\s*\{[\s\S]*?gap:\s*14px/);
});
