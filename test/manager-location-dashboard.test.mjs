import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("manager requests, equipment, and dashboard metrics are scoped to selected sites", () => {
  const server=fs.readFileSync(new URL("../server.mjs",import.meta.url),"utf8");
  const source=fs.readFileSync(new URL("../src/main.jsx",import.meta.url),"utf8");
  assert.match(server,/adminLevel==='Manager'[\s\S]*scopedManagerSites=managerReportScope\(manager\)\.sites/);
  assert.match(server,/rows\.filter\(\(row\)=>reportScopeIncludesSite\(\{sites:scopedManagerSites\},row\.site\)\)/);
  assert.match(server,/managerRecord&&row\.master_name==='Equipment master'/);
  assert.match(server,/managerScope=managerRecord\?managerReportScope\(managerRecord\):null/);
  assert.match(server,/equipmentSite=canonicalSiteName\(record\.currentLocation\|\|record\.site\|\|record\.location\|\|''\)/);
  assert.match(source,/function ManagerDashboard\(\{ managerRole, managerRoles = \[\], managerLocation/);
  assert.match(source,/siteEquipment = managerLocation\?equipmentRecords\.filter/);
  assert.match(source,/offRoadKeys = new Set\(openRequests/);
  assert.match(source,/onRoad:Math\.max\(0,siteEquipment\.length-offRoad-idle\)/);
  assert.match(source,/\["Idle", fleet\.idle/);
  assert.doesNotMatch(source.slice(source.indexOf("function ManagerDashboard"),source.indexOf("function Dashboard")),/Active breakdowns/);
  assert.match(source,/formatTwelveHourDateTime\(r\.start\)/);
});
