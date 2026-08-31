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
  assert.match(client, /onClick=\{\(\) => setAssetDrilldown\("equipment"\)\}/);
  assert.match(client, /onClick=\{\(\) => setAssetDrilldown\("vehicle"\)\}/);
  assert.match(client, /className="dashboard-asset-list"[\s\S]*Equipment name[\s\S]*equipmentName/);
  assert.match(client, /<Modal className="dashboard-asset-modal"/);
  assert.match(client, /Equipment group<\/th><th>Make<\/th><th>Model<\/th>/);
  assert.match(client, /Recent breakdown cases[\s\S]*showMakeModel/);
  assert.match(client, /showMakeModel && <><td>\{r\.make \|\| "—"\}<\/td><td>\{r\.model \|\| "—"\}<\/td><\/>/);
});
