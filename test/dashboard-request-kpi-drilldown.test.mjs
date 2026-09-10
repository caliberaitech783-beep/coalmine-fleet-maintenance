import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const browser = fs.readFileSync(new URL("../src/dashboard-record-browser.jsx", import.meta.url), "utf8");

test("operational dashboard graphs share the region list browser", () => {
  assert.match(source, /setBreakdownDetailSite\(site\.site\)/);
  assert.match(source, /openAssetDrilldown\(`site-status:\$\{site\.site\}\|all`\)/);
  assert.match(source, /fleetChartMode === "total" \? "site" : "offroad-site"/);
  assert.match(source, /key: `group:\$\{group\.label\}`/);
  assert.match(source, /openAssetDrilldown\(`event:\$\{item\.key\}`\)/);
  assert.match(source, /openAssetDrilldown\(`event:\$\{event\}:\$\{day\.date\}`\)/);
  assert.match(source, /<DashboardRecordBrowser key=\{assetDrilldown\} rows=\{assetDrilldownRows\}/);
  assert.doesNotMatch(source, /Step [1-5] · (Select|Full details|Request details)/);
});

test("request lists retain job, equipment, site and lifecycle details", () => {
  assert.match(source, /const equipment = equipmentForRequest\(request\)/);
  assert.match(source, /requestReference: request\.ref \|\| request\.reference/);
  assert.match(source, /requestSite: request\.site \|\| request\.location/);
  assert.match(browser, /requestRecords && <><th>Job reference<\/th><th>Status<\/th><th>Started<\/th><th>Days of breakdown<\/th><\/>/);
  assert.match(browser, /<th>Serial \/ chassis no\.<\/th>\{requestRecords && <th>Repair category<\/th>\}/);
  assert.match(browser, /formatBreakdownDaysHours\(record\.requestStart, record\.requestClosed, now\)/);
  assert.match(browser, /<Status>\{record\.requestStatus\}<\/Status>/);
  assert.match(browser, /lifecycleRecords && <><th>Closed<\/th><th>MIS verified at<\/th><th>First trip time<\/th>/);
});

test("repair and event chart context stays applied before the list filters", () => {
  assert.match(source, /key\.startsWith\("repair:"\)\) return requestAssetRows\(visibleBreakdowns\.filter/);
  assert.match(source, /const rows = event === "closed" && !date \? maintenanceClosedRows : requestLifecycleRows\[event\] \|\| \[\]/);
  assert.match(source, /lifecycleDrilldownParts\[1\] === "opened" \? "Opened requests"/);
  assert.match(source, /date \? rows\.filter\(\(record\) => requestEventDate\(record, event\) === date\) : rows/);
  assert.match(source, /requestRecords=\{requestAssetDrilldown\} lifecycleRecords=\{assetDrilldown\.startsWith\("event:"\)\}/);
});

test("job references open the request timeline from every list, not only the master", () => {
  assert.match(source, /RequestTimelineButton=\{RequestTimelineButton\} timelineToken=\{authToken\} Dialog=\{Modal\} \/>/);
  assert.match(browser, /<td><b>\{referenceCell\(record\.requestReference\)\}<\/b><\/td>/);
  assert.match(browser, /<RequestTimelineButton reference=\{reference\} token=\{timelineToken\} Dialog=\{Dialog\} \/>/);
  assert.match(browser, /data-sort-value=\{sortableDate\(record\.requestStart\)\}/);
  assert.match(browser, /data-sort-value=\{calculateBreakdownMinutes\(record\.requestStart, record\.requestClosed, now\)\}/);
  assert.match(source, /<td><RequestTimelineButton reference=\{request\.ref\} token=\{authToken\} Dialog=\{Modal\} \/><\/td><td>\{request\.door\}<\/td>/);
  assert.match(source, /render: \(request\) => request\.ref \? <RequestTimelineButton reference=\{request\.ref\} token=\{session\?\.token \|\| authToken\} Dialog=\{Modal\} \/> : <b>—<\/b>\}/);
  assert.doesNotMatch(source, /<td><b>\{request\.ref\}<\/b><\/td>/);
});
