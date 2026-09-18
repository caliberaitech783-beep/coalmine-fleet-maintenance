import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

test("Night mode gives the Fleet control dashboard its dark palette", async () => {
  const [main, night] = await Promise.all([read("main.jsx"), read("dashboard-night.css")]);

  // brand-theme.css paints every .mine-dashboard with the Day palette, so the
  // Night sheet has to load after it and every later dashboard sheet.
  const cssImports = [...main.matchAll(/^import "\.\/([\w-]+\.css)";/gm)].map((match) => match[1]);
  assert.equal(cssImports.at(-1), "dashboard-night.css");

  const palette = night.match(/\.mine-dashboard\.mine-dashboard-night \{[^}]*\}/);
  assert.ok(palette, "expected the night palette rule");
  assert.match(palette[0], /--mine-panel: #241d27;/);
  assert.match(palette[0], /--mine-text: #f6f0f7;/);
  assert.match(palette[0], /background: linear-gradient\([^;]*#171219/);

  // Printed pages keep the Day palette.
  assert.match(night, /^@media screen \{/m);
  assert.equal((night.match(/^\}/gm) || []).length, 1, "every night rule sits inside @media screen");
});

test("Total Fleet bars stay visible on the dark panel", async () => {
  const night = await read("dashboard-night.css");
  const chart = night.match(/\.mine-dashboard\.mine-dashboard-night \.mine-fleet-region-chart \{[^}]*\}/);
  assert.ok(chart, "expected night bar colours");
  // The Day purple (#522e90) and breakdown red (#8b0000) are under 2:1 on #241d27.
  assert.match(chart[0], /--fleet-vehicles: #a67bd3;/);
  assert.match(chart[0], /--fleet-breakdown: #cc2a31;/);
  assert.doesNotMatch(chart[0], /#522e90|#8b0000/);
  assert.match(night, /\.mine-fleet-bar\.vehicles \{ background: linear-gradient\(180deg, #c2a0ea, var\(--fleet-vehicles\)\); \}/);
  assert.match(night, /\.mine-fleet-site-summary button\.bd-percent \{ color: #ff8a8e; \}/);
});

test("Dashboard PDFs keep the Day palette when the screen is in Night mode", async () => {
  const pdf = await read("dashboard-pdf.mjs");
  const swap = pdf.indexOf('clone.classList.replace("mine-dashboard-night", "mine-dashboard-day")');
  assert.ok(swap > 0, "expected the capture clone to switch to the Day class");
  // The swap must happen before the clone is inserted and styled.
  assert.ok(swap < pdf.indexOf("document.body.appendChild(host)"));
});
