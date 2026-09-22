import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const client = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const requestLoader = fs.readFileSync(new URL("../src/dashboard-request-data.mjs", import.meta.url), "utf8");

test("only production starts a second site-wide dashboard feed", () => {
  const normal = client.slice(client.indexOf("function Normal("), client.indexOf("function App("));
  assert.match(requestLoader, /fetchImpl\(`\/api\/requests\?scope=dashboard&t=\$\{now\(\)\}`/);
  assert.match(requestLoader, /cache: "no-store"/);
  assert.match(normal, /createDashboardRequestLoader\(\{onState:setDashboardState\}\)/);
  assert.match(normal, /watchRequestRefresh\(\(\)=>loader\.load\(session\?\.token\|\|authToken\),\{win:window,doc:document,initial:true\}\)/);
  assert.match(normal, /const needsDedicatedDashboardFeed = !embedded && mobileRole === "Production User"/);
  assert.match(normal, /if \(!needsDedicatedDashboardFeed\) return undefined/);
  assert.match(normal, /if \(!\['dashboard','reports'\]\.includes\(section\)\) return undefined/);
  assert.match(normal, /\},\[session\?\.token,needsDedicatedDashboardFeed,section\]\)/);
  assert.match(normal, /const dashboardRequests=needsDedicatedDashboardFeed \? dashboardState\.records : requests/);
  assert.match(normal, /stop\(\);loader\.cancel\(\);dashboardLoader\.current=null/);
  assert.match(client, /<Dashboard requests=\{misDashboardRequests\}/);
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
  assert.match(client, /<h2>Breakdown trend<\/h2>/);
  assert.match(client, /aria-label="Breakdown trend site"/);
  assert.match(client, /\[7, 14, 30\]\.map/);
  assert.doesNotMatch(client, /<BreakdownTable rows=\{visibleBreakdowns\} showMakeModel showDateFilter rowLimit=\{5\}/);
  assert.match(client, /showMakeModel && <><td>\{r\.make \|\| "—"\}<\/td><td>\{r\.model \|\| "—"\}<\/td><\/>/);
});
