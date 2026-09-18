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

test("Dashboard PDF downloads keep the Day palette when the screen is in Night mode", async () => {
  const pdf = await read("dashboard-pdf.mjs");
  const swap = pdf.indexOf('if (!forPrint) clone.classList.replace("mine-dashboard-night", "mine-dashboard-day")');
  assert.ok(swap > 0, "expected the download capture to switch to the Day class");
  // The swap must happen before the clone is inserted and styled.
  assert.ok(swap < pdf.indexOf("document.body.appendChild(host)"));
  const download = pdf.slice(pdf.indexOf("export async function downloadDashboardPdf("), pdf.indexOf("export async function printDashboard("));
  assert.match(download, /const \{canvas\} = await captureDashboard\(dashboard\);/, "downloads do not ask for the print capture");
});

test("Dashboard prints keep the screen's Night palette, dark to the edge of the paper", async () => {
  const pdf = await read("dashboard-pdf.mjs");
  assert.equal((pdf.match(/captureDashboard\(dashboard, \{forPrint: true\}\)/g) || []).length, 2, "Smart Print and the browser print window both keep the screen palette");
  assert.match(pdf, /const background = forPrint \? pageBackground\(dashboard\) : "";/, "the paper takes the colour behind the dashboard on screen");
  const print = pdf.slice(pdf.indexOf("export async function dashboardPrintPdf("), pdf.indexOf("async function printDashboardCanvas("));
  assert.match(print, /context\.fillStyle = paper;/);
  assert.match(print, /pdf\.setFillColor\(paper\);\n\s+pdf\.rect\(0, 0, pageWidth, pageHeight, "F"\);\n\s+pdf\.addImage\(/, "every sheet is painted before the dashboard is placed on it");
  assert.doesNotMatch(print, /#ffffff/, "no white is forced onto a Night print");
  const browser = pdf.slice(pdf.indexOf("async function printDashboardCanvas("));
  assert.match(browser, /html,body\{margin:0;padding:0;background:\$\{background\};print-color-adjust:exact;-webkit-print-color-adjust:exact\}/);
  assert.match(browser, /context\.fillStyle = background;/);
});

test("Smart Print is readable in Night mode and keeps a white paper preview", async () => {
  const css = await read("smart-print.css");
  assert.match(css, /:root\[data-theme="dark"\] \.smart-print-dialog \{[^}]*background: #241d27;[^}]*color: #f6f0f7;/);
  assert.match(css, /:root\[data-theme="dark"\] \.smart-print-dialog :is\(button, select\) \{[^}]*background: #2d2331;/);
  // The dark theme lightens every table cell, so the paper preview pins its own ink.
  assert.match(css, /:root\[data-theme="dark"\] \.smart-print-sheet td \{ background: #fff; color: #17233c; \}/);
  assert.match(css, /:root\[data-theme="dark"\] \.smart-print-sheet th \{ background: #10284c; color: #fff; \}/);
});

test("Dashboard list dialogs use dark panels in Night mode", async () => {
  const [browser, theme] = await Promise.all([read("dashboard-record-browser.css"), read("theme.css")]);
  // --panel is otherwise undefined, so var(--panel, #fff) painted these dialogs white.
  assert.match(browser, /:root\[data-theme="dark"\] :is\(\.dashboard-asset-modal, \.hourly-breakdown-view\) \{ --panel: #241d27; --surface: #241d27; --text: #f6f0f7; \}/);
  assert.match(browser, /--record-purple: #c9a8f0;/);
  assert.match(theme, /:root\[data-theme="dark"\] \.request-timeline-link \{ color: #c9a8f0; \}/);
  assert.match(theme, /:root\[data-theme="dark"\] \.sort-header:is\(:hover, :focus-visible, \.active\)/);
});
