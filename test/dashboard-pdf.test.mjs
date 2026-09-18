import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dashboardPageSlices, dashboardPrintPdf, downloadDashboardPdf} from "../src/dashboard-pdf.mjs";

test("dashboard image uses opaque browser-encoded JPEG rather than PDF PNG conversion", () => {
  const source = readFileSync(new URL("../src/dashboard-pdf.mjs", import.meta.url), "utf8");
  assert.match(source, /getContext\("2d", \{alpha: false\}\)/);
  assert.match(source, /toDataURL\("image\/jpeg", 0\.98\), "JPEG"/);
  assert.doesNotMatch(source, /addImage\(part, "PNG"/);
});

test("dashboard PDF reports an unavailable dashboard without downloading", async () => {
  await assert.rejects(downloadDashboardPdf(null, "dashboard.pdf"), /Dashboard is not available/);
});

test("both KPI exports opt into visual PDF without changing ordinary table exports", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.equal((source.match(/label="Export KPIs" dashboardPdf/g) || []).length, 2);
  assert.match(source, /dashboardPdf = false/);
  assert.match(source, /if \(dashboardPdf\) \{[\s\S]*?downloadDashboardPdf[\s\S]*?return;\s*\}/);
  assert.match(source, /fetch\("\/api\/exports\/pdf"/);
});

test("Smart Print on a dashboard prints the dashboard itself, not the KPI table", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const printReport = source.slice(source.indexOf("  const printReport = () => {"), source.indexOf("  if (printOnly) return"));
  assert.match(printReport, /if \(dashboardPdf\) \{\n\s+const dashboard = triggerRef\.current\?\.closest\("\.mine-dashboard, \.manager-dashboard"\);/, "the same dashboard element the PDF download captures");
  assert.match(printReport, /openSmartPrint\(\{ title, snapshot: "The dashboard prints exactly as it looks on screen/, "no KPI columns to pick");
  assert.match(printReport, /onPrint: \(\{ pageSize, printOptions \}\) => printDashboardReport\(\{ dashboard, title, pageSize, printOptions \}\)/);
  assert.match(printReport, /onPrint: printTableReport, formatCell: exportCellText \}\);/, "every other report still prints its table");
  const dashboardPrint = source.slice(source.indexOf("function printDashboardReport("), source.indexOf("function printTableReportInBrowser("));
  assert.match(dashboardPrint, /printReportDirect\(\{ title, pageSize, printOptions \}, async \(page\) => \(await loadCapture\(\)\)\.dashboardPrintPdf\(dashboard, page\)\)/, "the print helper gets the captured dashboard at the chosen paper size");
  assert.match(dashboardPrint, /if \(!sent\) await \(await loadCapture\(\)\)\.printDashboard\(dashboard, title\);/, "without the helper the captured dashboard opens in the browser print window");
  assert.match(source, /if \(buildPdf\) pdf = await buildPdf\(page\);\n\s+else \{/, "the preview and printer receive that PDF instead of the table");
});

test("printed dashboard pages cover every row once and end on the blank band between panels", () => {
  const blank = new Set([350, 720]);
  assert.deepEqual(dashboardPageSlices(1000, 400, row => blank.has(row)), [{top: 0, height: 350}, {top: 350, height: 370}, {top: 720, height: 280}]);
  assert.deepEqual(dashboardPageSlices(1000, 400), [{top: 0, height: 400}, {top: 400, height: 400}, {top: 800, height: 200}], "without a blank band a page is cut at its full height");
  assert.deepEqual(dashboardPageSlices(1000, 400, row => row === 100).slice(0, 1), [{top: 0, height: 400}], "a gap far above the page end is not used, so pages are not left half empty");
  assert.deepEqual(dashboardPageSlices(300, 400), [{top: 0, height: 300}], "a short dashboard is one page");
  for (const [total, page] of [[5000, 613.7], [1, 400], [2600, 2600]]) {
    const slices = dashboardPageSlices(total, page, row => row % 97 === 0);
    assert.equal(slices.reduce((sum, slice) => sum + slice.height, 0), total);
    slices.forEach((slice, index) => {
      assert.ok(slice.height > 0 && slice.height <= Math.floor(page));
      if (index) assert.equal(slice.top, slices[index - 1].top + slices[index - 1].height, "pages follow on without gaps or overlaps");
    });
  }
});

test("printing an unavailable dashboard is refused before anything is prepared", async () => {
  await assert.rejects(dashboardPrintPdf(null, {widthMm: 297, heightMm: 210}), /Dashboard is not available/);
});

test("a print starts with the clock row and keeps the sticky banner in its place", () => {
  const source = readFileSync(new URL("../src/dashboard-pdf.mjs", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(source, /const clockRow = forPrint \? document\.querySelector\("\.content > \.top, \.normal > header"\) : null;/, "the row with the live time and date, for prints only");
  assert.match(source, /root\.append\(rowClone, clone\);/, "the clock row sits above the dashboard, as on screen");
  assert.match(source, /root\.querySelectorAll\("\.export-menu, \.overlay, \[role=dialog\]"\)\.forEach\(node => node\.remove\(\)\);/);
  assert.match(source, /root\.querySelectorAll\("\*"\)\.forEach\(node => \{\n\s+const style = getComputedStyle\(node\);\n[^\n]*\n\s+if \(style\.position === "sticky"\) node\.style\.position = "static";/, "a banner pinned while the page is scrolled is not pushed down over the charts");
  assert.match(source, /const canvas = await toCanvas\(root, /, "the capture covers the clock row and the dashboard together");
});
