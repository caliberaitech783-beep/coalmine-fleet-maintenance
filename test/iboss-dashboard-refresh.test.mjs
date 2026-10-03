import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {dashboardFinancialYearRange,DASHBOARD_REFRESH_MS} from '../src/iboss-dashboard-refresh.mjs';

test('Accounts defaults to April financial year through today in India',()=>{
 for(const [now,from,to] of [
  ['2026-10-03T06:00:00Z','2026-04-01','2026-10-03'],
  ['2027-01-01T00:00:00Z','2026-04-01','2027-01-01'],
  ['2027-03-31T18:29:59Z','2026-04-01','2027-03-31'],
  ['2027-03-31T18:30:00Z','2027-04-01','2027-04-01'],
 ])assert.deepEqual(dashboardFinancialYearRange(new Date(now)),{from,to});
});

test('live dashboard refresh uses ten minutes, skips in-flight requests and cleans up its timer',()=>{
 assert.equal(DASHBOARD_REFRESH_MS,600000);
 const source=fs.readFileSync(new URL('../src/iboss-dashboard.jsx',import.meta.url),'utf8');
 assert.match(source,/if\(preview\|\|data.loading\|\|data.refreshing\)return/);
 assert.match(source,/setInterval\(\(\)=>setAttempt\(value=>value\+1\),DASHBOARD_REFRESH_MS\)/);
 assert.match(source,/return \(\)=>clearInterval\(timer\)/);
 assert.match(source,/\[preview,data.loading,data.refreshing,attempt\]/);
 assert.match(source,/new URLSearchParams\(\{\.\.\.range,section\}\)/);
 assert.match(source,/cache:'no-store'/);
});
