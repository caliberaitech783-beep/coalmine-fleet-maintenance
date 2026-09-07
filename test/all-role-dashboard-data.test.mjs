import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const client = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("every operational dashboard loads site-wide requests separately from personal workflow rows", () => {
  assert.match(client, /fetch\(`\/api\/requests\?scope=dashboard&t=\$\{Date\.now\(\)\}`/);
  assert.match(client, /<Dashboard requests=\{dashboardRequests\}/);
  assert.match(server, /const dashboardScope=req\.query\.scope==='dashboard'/);
  assert.match(server, /assignedRole==='Production User'&&!dashboardScope/);
});

test("equipment and vehicle totals open a name list on every dashboard", () => {
  assert.match(client, /\{ label: "Equipment", total: assetCounts\.equipment, key: "equipment"/);
  assert.match(client, /\{ label: "Vehicles", total: assetCounts\.vehicles, key: "vehicle"/);
  assert.match(client, /assetCategoryPieSlices\.map\(\(slice\) => <button[^>]*onClick=\{\(\) => openAssetDrilldown\(slice\.key\)\}/);
  assert.match(client, /<Modal className="dashboard-asset-modal"/);
  assert.match(client, /<DashboardRecordBrowser key=\{assetDrilldown\} rows=\{assetDrilldownRows\}/);
  assert.match(client, /const assetDrilldownRegions = availableRegions\.map/);
  assert.match(client, /<h2>Breakdown trend & forecast<\/h2>/);
  assert.match(client, /aria-label="Breakdown trend site"/);
  assert.match(client, /\[7, 14, 30\]\.map/);
  assert.doesNotMatch(client, /<BreakdownTable rows=\{visibleBreakdowns\} showMakeModel showDateFilter rowLimit=\{5\}/);
  assert.match(client, /showMakeModel && <><td>\{r\.make \|\| "—"\}<\/td><td>\{r\.model \|\| "—"\}<\/td><\/>/);
});
