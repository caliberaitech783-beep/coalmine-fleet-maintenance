import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("manager requests, equipment, and dashboard metrics are scoped to the assigned location", () => {
  const server=fs.readFileSync(new URL("../server.mjs",import.meta.url),"utf8");
  const source=fs.readFileSync(new URL("../src/main.jsx",import.meta.url),"utf8");
  assert.match(server,/adminLevel==='Manager'[\s\S]*maintenance_requests WHERE lower\(trim\(site\)\)=lower\(trim\(\$1\)\)/);
  assert.match(server,/managerRecord&&row\.master_name==='Equipment master'/);
  assert.match(source,/function ManagerDashboard\(\{ managerRole, managerLocation/);
  assert.match(source,/siteEquipment = equipmentRecords\.filter/);
  assert.match(source,/offRoadKeys = new Set\(openRequests/);
  assert.match(source,/onRoad:Math\.max\(0,siteEquipment\.length-offRoad\)/);
  assert.doesNotMatch(source.slice(source.indexOf("function ManagerDashboard"),source.indexOf("function Dashboard")),/Active breakdowns/);
  assert.match(source,/formatTwelveHourDateTime\(r\.start\)/);
});
