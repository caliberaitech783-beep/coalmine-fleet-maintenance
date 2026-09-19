import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dailyCountChange, formatCountDelta, indiaCountDayWindow, resolveCountTrend } from "../src/fleet-count-trend.mjs";
import { dashboardFleetSnapshot } from "../dashboard-fleet-snapshot.mjs";
import { fleetChartCounts } from "../dashboard-equipment-metrics.mjs";
import * as access from "../dashboard-equipment-access.mjs";

test("the daily count window rolls over at midnight in India regardless of device timezone", () => {
  const before = indiaCountDayWindow("2026-09-19T18:29:59.999Z");
  assert.equal(before.day, "2026-09-19");
  assert.equal(before.openingAt.toISOString(), "2026-09-18T18:30:00.000Z");
  assert.equal(before.nextMidnightAt.toISOString(), "2026-09-19T18:30:00.000Z");
  const after = indiaCountDayWindow("2026-09-19T18:30:00.000Z");
  assert.equal(after.day, "2026-09-20");
  assert.equal(after.openingAt.toISOString(), before.nextMidnightAt.toISOString());
});

test("daily movement is current minus the shared midnight count", () => {
  assert.deepEqual(dailyCountChange(80, 79, "2026-09-19"), {day:"2026-09-19",open:80,current:79,delta:-1,direction:"down"});
  assert.deepEqual(dailyCountChange(80, 92, "2026-09-19"), {day:"2026-09-19",open:80,current:92,delta:12,direction:"up"});
  assert.equal(resolveCountTrend(80, 80), null);
  assert.equal(dailyCountChange(-1, 2, "2026-09-19"), null);
  assert.equal(formatCountDelta(12), "+12");
  assert.equal(formatCountDelta(-1), "−1");
  assert.equal(formatCountDelta(0), "0");
});

test("the dashboard endpoint gives the same result on both devices for the same combined site access", async () => {
  const source = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const route = source.slice(source.indexOf("app.get('/api/dashboard/equipment'"), source.indexOf("app.get('/api/reports/master-data'"));
  const fleet = [
    {id:1,door:"A",category:"Vehicle",currentLocation:"Sasti OB"},
    {id:2,door:"B",category:"Equipment",currentLocation:"Majri OB"},
    {id:3,door:"C",category:"Vehicle",currentLocation:"Jayant OB"},
  ];
  // A closed today, B opened today, C stayed open. Their midnight and live
  // statuses are computed once on the server, then scoped to assigned sites.
  const rows = [
    {ref:"A",door:"A",site:"Sasti OB",status:"Closed",currentlyActive:false,openAtMidnight:true,midnightStatus:"In progress"},
    {ref:"B",door:"B",site:"Majri OB",status:"Open",currentlyActive:true,openAtMidnight:false,midnightStatus:"In progress"},
    {ref:"C",door:"C",site:"Jayant OB",status:"Open",currentlyActive:true,openAtMidnight:true,midnightStatus:"In progress"},
  ];
  let handler;
  const queries = [];
  let user = {site:"Sasti OB | Majri OB"};
  const session = {role:"normal",assignedRole:"Production User"};
  const dependencies = {...access,dashboardFleetSnapshot,fleetChartCounts,dailyCountChange,indiaCountDayWindow,
    app:{get(_path,...handlers){handler=handlers.at(-1);}},
    requireSession() {},
    currentDashboardAuthorization:async()=>({session,user}),
    pool:{async query(sql){queries.push(sql);return {rows:sql.includes("master_records") ? fleet.map(({id,...record_data})=>({id,record_data})) : rows};}},
  };
  new Function(...Object.keys(dependencies),route)(...Object.values(dependencies));
  const read = async () => {
    let response;
    await handler({session},{json(body){response=body;return this;},status(){return this;}},error=>{throw error;});
    return response;
  };
  const first = await read();
  const second = await read();
  assert.deepEqual(first.breakdownCountChange,second.breakdownCountChange);
  assert.deepEqual({open:first.breakdownCountChange.open,current:first.breakdownCountChange.current,delta:first.breakdownCountChange.delta},{open:1,current:1,delta:0});
  assert.equal(first.records.length,2);

  user={site:"Sasti OB"};
  const single = await read();
  assert.deepEqual({open:single.breakdownCountChange.open,current:single.breakdownCountChange.current,delta:single.breakdownCountChange.delta},{open:1,current:0,delta:-1});
  assert.equal(single.records.length,1);
  user={site:"Majri OB"};
  const other = await read();
  assert.deepEqual({open:other.breakdownCountChange.open,current:other.breakdownCountChange.current,delta:other.breakdownCountChange.delta},{open:0,current:1,delta:1});
  assert.match(queries[1], /started_at < \$1 AND \(closed_at IS NULL OR closed_at >= \$1\)/);
  assert.match(queries[1], /ideal_requested_at < \$1/);
});

test("the badge reads the server count and does not use browser storage or dashboard filters", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const dashboard = source.slice(source.indexOf("function Dashboard("), source.indexOf("function BreakdownTable"));
  assert.match(source, /setBreakdownCountChange\(change\)/);
  assert.match(source, /Date\.parse\(nextCountDayAt\) - Date\.now\(\)/);
  assert.match(dashboard, /const accountBreakdownCount = breakdownCountChange\?\.current \?\? liveBreakdownAssetCount/);
  assert.match(dashboard, /formatCountDelta\(breakdownCountChange\.delta\)/);
  assert.match(dashboard, /fleet-breakdown:account/);
  assert.doesNotMatch(dashboard, /trackCountChange|BREAKDOWN_COUNT_STORAGE_KEY/);
});
