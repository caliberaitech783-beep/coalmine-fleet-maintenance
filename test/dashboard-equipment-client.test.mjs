import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {dashboardEquipmentScope, scopeDashboardEquipmentRecords} from "../dashboard-equipment-access.mjs";

const source=readFileSync(new URL("../src/main.jsx",import.meta.url),"utf8");
const styles=readFileSync(new URL("../src/dashboard-concept-a.css",import.meta.url),"utf8");

test("dashboards load fleet records through the dedicated read-only endpoint",()=>{
  const hook=source.slice(source.indexOf("function useDashboardEquipment"),source.indexOf("function FleetDataState"));
  assert.match(hook,/fetch\("\/api\/dashboard\/equipment"/);
  assert.match(hook,/cache: "no-store"/);
  assert.match(hook,/const controller = new AbortController\(\)/);
  assert.match(hook,/signal: controller\.signal/);
  assert.match(hook,/controller\.abort\(\)/);
  assert.match(hook,/if \(!Array\.isArray\(data\.records\)\) throw new Error/);
  assert.match(hook,/typeof data\.scope\.restrictToScope !== "boolean"/);
  assert.match(hook,/data\.scope\.allowedSites !== null && !Array\.isArray/);
  assert.match(hook,/setRecords\(data\.records\);\s*setScope\(data\.scope\);\s*setLoaded\(true\)/);
  assert.match(hook,/setLoadAttempt\(\(attempt\) => attempt \+ 1\)/);
  assert.doesNotMatch(hook,/\/api\/masters/);

  const manager=source.slice(source.indexOf("function ManagerDashboard"),source.indexOf("const dashboardRepairTypeDefaults"));
  const dashboard=source.slice(source.indexOf("function Dashboard({"),source.indexOf("function BreakdownTable"));
  assert.match(manager,/useDashboardEquipment\(\)/);
  assert.match(dashboard,/useDashboardEquipment\(\)/);
  assert.doesNotMatch(manager,/useMasterRecords\("Equipment master"\)/);
  assert.doesNotMatch(dashboard,/useMasterRecords\("Equipment master"\)/);
});

test("fleet panels distinguish loading and failure from a confirmed empty fleet",()=>{
  const hook=source.slice(source.indexOf("function useDashboardEquipment"),source.indexOf("function FleetDataState"));
  const state=source.slice(source.indexOf("function FleetDataState"),source.indexOf("function ManagerDashboard"));
  const dashboard=source.slice(source.indexOf("function Dashboard({"),source.indexOf("function BreakdownTable"));

  // An empty array is valid and advances loaded=true; malformed responses do not.
  assert.match(hook,/Array\.isArray\(data\.records\)/);
  assert.match(hook,/setRecords\(data\.records\);\s*setScope\(data\.scope\);\s*setLoaded\(true\)/);
  assert.match(state,/Fleet data is unavailable/);
  assert.match(state,/Loading fleet data/);
  assert.match(state,/onClick=\{retry\}/);
  assert.match(dashboard,/equipmentLoaded\?assetCounts\.total\.toLocaleString\(\):"—"/);
  assert.match(dashboard,/equipmentLoaded\?roadStatusTotal\.toLocaleString\(\):"—"/);
  assert.match(dashboard,/equipmentLoaded\?kpis\.total\.toLocaleString\(\):"—"/);
  assert.ok((dashboard.match(/<FleetDataState /g)||[]).length>=4);
  assert.match(styles,/\.dashboard-fleet-data-state\s*\{/);
  assert.match(styles,/\.dashboard-fleet-chart-state,.dashboard-road-status-state\s*\{\s*min-height:\s*205px/);
  assert.match(styles,/\.dashboard-fleet-performance-state\s*\{\s*min-height:\s*319px/);
});

test("fleet records and scope are applied atomically without profile-based double filtering",()=>{
  const manager=source.slice(source.indexOf("function ManagerDashboard"),source.indexOf("const dashboardRepairTypeDefaults"));
  const dashboard=source.slice(source.indexOf("function Dashboard({"),source.indexOf("function BreakdownTable"));
  assert.match(manager,/const siteEquipment = equipmentRecords;/);
  assert.match(manager,/const scopedRequests=equipmentLoaded\?/);
  assert.match(manager,/restrictManagerScope\?\[\]:requests\):\[\];/);
  assert.doesNotMatch(manager,/managerLocation\?equipmentRecords\.filter/);
  assert.match(dashboard,/scope:equipmentScope/);
  assert.match(dashboard,/Array\.isArray\(equipmentScope\?\.allowedSites\)/);
  assert.match(dashboard,/equipmentScope\?\.restrictToScope===true/);
  assert.match(dashboard,/const scopedBreakdowns=equipmentLoaded\?/);
  assert.match(dashboard,/restrictToScope\?\[\]:requests\):\[\];/);
  assert.doesNotMatch(dashboard,/allowedSites = null|allowedRegions = null/);
  assert.doesNotMatch(dashboard,/profileManagerSites|profileLocation\?\[profileLocation\]/);
});

test("a failed profile request cannot turn an otherwise valid fleet response into zero",()=>{
  const app=source.slice(source.indexOf("function App()"));
  const normal=source.slice(source.indexOf("function Normal("),source.indexOf("function App()"));
  const dashboard=source.slice(source.indexOf("function Dashboard({"),source.indexOf("function BreakdownTable"));

  assert.match(app,/fetch\("\/api\/me\/profile"[\s\S]*\.catch\(\(\) => \{\}\)/);
  assert.match(app,/<Dashboard goto=\{selectMenu\}[\s\S]*requests=\{requests\} theme=\{theme\} \/>/);
  assert.match(normal,/<Dashboard requests=\{dashboardRequests\} theme=\{theme\} \/>/);
  assert.doesNotMatch(app,/profileManagerSites|allowedSites=\{|allowedRegions=\{|restrictToScope=/);
  assert.doesNotMatch(normal,/allowedSites=\{|allowedRegions=\{|restrictToScope/);
  assert.match(dashboard,/const scopedBreakdowns=equipmentLoaded\?/);
  assert.match(dashboard,/restrictToScope\?\[\]:requests\):\[\];/);
  assert.match(dashboard,/equipmentLoaded\?<div className="mine-repair-type-bars"/);
  assert.match(dashboard,/equipmentLoaded\?<><div className="mine-request-lifecycle-summary"/);
  assert.match(dashboard,/equipmentLoaded\?<div className="mine-breakdown-trend-body"/);
});

test("a region-only manager receives that region's fleet instead of an empty scope",()=>{
  const managerSession={role:"super",permissions:{adminLevel:"Manager"}};
  const manager={managerRegion:"WCL",managerSites:""};
  const records=[
    {id:1,currentLocation:"SASTI II"},
    {id:2,currentLocation:"Majri OB"},
    {id:3,currentLocation:"Jayant OB"},
  ];
  const scope=dashboardEquipmentScope(managerSession,manager);

  assert.equal(scope.restrictToScope,true);
  assert.deepEqual(scope.allowedRegions,["WCL"]);
  assert.ok(scope.allowedSites.length>0);
  assert.deepEqual(
    scopeDashboardEquipmentRecords(records,managerSession,manager,scope).map(({id})=>id),
    [1,2],
  );
});
