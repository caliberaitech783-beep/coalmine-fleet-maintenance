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
  assert.match(source, /openAssetDrilldown\(`event:\$\{key\}:\$\{day\.date\}`\)/);
  assert.match(source, /<DashboardRecordBrowser key=\{assetDrilldown\}[^\n]* rows=\{assetDrilldownRows\}/);
  assert.doesNotMatch(source, /Step [1-5] · (Select|Full details|Request details)/);
});

test("request lists retain job, equipment, site and lifecycle details", () => {
  assert.match(source, /const equipment = equipmentForRequest\(request\)/);
  assert.match(source, /requestReference: request\.ref \|\| request\.reference/);
  assert.match(source, /requestSite: request\.site \|\| request\.location/);
  assert.ok(browser.includes('<th>Status</th><th>Days of breakdown</th>'));
  assert.ok(browser.includes('<th data-filter-mode={requestRecords ? undefined : "date-sort"}>Started</th>'));
  assert.ok(browser.includes('<th>Serial / chassis no.</th>{requestRecords && <><th>Breakdown type</th><th>Delayed reason</th><th>Breakdown reason</th>{idleDateFilter && <><th>Idle reason</th><th>Days of idle</th></>}</>}'));
  assert.match(browser, /<td>\{record\.repairCategory\}<\/td><td>\{record\.delayedReason \|\| "—"\}<\/td>/);
  assert.match(browser, /formatBreakdownDaysHours\(record\.requestStart, record\.requestClosed, now\)/);
  assert.match(browser, /<Status>\{record\.requestStatus \|\| "—"\}<\/Status>/);
  assert.match(browser, /showClosedColumn && <th>Closed<\/th>/);
  assert.match(browser, /showVerificationColumns && <><th>MIS verified at<\/th><th>First trip time<\/th>/);
});

test("repair and event chart context stays applied before the list filters", () => {
  assert.match(source, /key\.startsWith\("repair:"\)\) return requestAssetRows\(visibleBreakdowns\.filter/);
  assert.match(source, /key\.startsWith\("status:"\)\) return requestAssetRows\(visibleBreakdowns\.filter\(\(record\) => requestStatusLabel\(record\)\.toLowerCase\(\)/);
  assert.match(source, /const rows = event === "closed" && !date \? maintenanceClosedRows : requestLifecycleRows\[event\] \|\| \[\]/);
  assert.match(source, /lifecycleDrilldownParts\[1\] === "opened" \? "Opened requests"/);
  assert.match(source, /date \? rows\.filter\(\(record\) => requestEventDate\(record, event\) === date\) : rows/);
  assert.match(source, /requestRecords=\{requestAssetDrilldown\} lifecycleRecords=\{assetDrilldown\.startsWith\("event:"\)\}/);
});

test("the time breakdown opens from the Days of breakdown value in every list, and job references stay plain", () => {
  assert.match(source, /RequestTimelineButton=\{RequestTimelineButton\} timelineToken=\{authToken\} Dialog=\{Modal\} Remarks=\{MaintenanceRemarks\} \/>/);
  assert.match(browser, /\{requestRecords && <td><b>\{record\.requestReference\}<\/b><\/td>\}<td data-sort-value=\{requestStatusSortRank\(record\.requestStatus\)\}>/);
  assert.match(source, /const assetDrilldownRows = requestDrilldownKey\(assetDrilldown\) \? rowsForAssetDrilldown\(assetDrilldown\) : fleetAssetRequestDetails\(rowsForAssetDrilldown\(assetDrilldown\), fleetDrilldownRequests\(assetDrilldown\)\)/);
  assert.match(source, /const requestDrilldownKey = \(key = ""\) => key === "open-cases" \|\| \["site-repair:", "repair:", "status:", "event:", "movement:", "balance:", "trend:"\]/);
  assert.match(browser, /<RequestTimelineButton reference=\{reference\} token=\{timelineToken\} Dialog=\{Dialog\} label=\{label\} \/>/);
  assert.match(browser, /data-sort-value=\{requestStatusSortRank\(record\.requestStatus\)\}/);
  assert.match(browser, /data-sort-value=\{sortableDate\(record\.requestStart\)\}/);
  assert.match(browser, /data-sort-value=\{calculateBreakdownMinutes\(record\.requestStart, record\.requestClosed, now\)\}>\{breakdownCell\(record\)\}/);
  assert.match(source, /case "ref": return <td><b>\{r\.ref\}<\/b><\/td>;/);
  assert.match(source, /case "breakdownDays": return <td><RequestTimelineButton reference=\{r\.ref\} token=\{authToken\} Dialog=\{Modal\} label=/);
  assert.match(source, /<td><b>\{request\.ref\}<\/b><\/td><td>\{request\.door\}<\/td>/);
  assert.match(source, /<td><RequestTimelineButton reference=\{request\.ref\} token=\{authToken\} Dialog=\{Modal\} label=\{`\$\{age\} \$\{age === 1 \? "day" : "days"\}`\} \/><\/td>/);
  assert.match(source, /columns=\{withTimelineLinks\(selectedReport\.columns, session\?\.token \|\| authToken\)\}/);
  assert.match(source, /const timeKey = \["days", "tat", "hours"\]\.find/);
  assert.doesNotMatch(source, /<td><RequestTimelineButton reference=\{(r|row|request)\.ref\} token=\{authToken\} Dialog=\{Modal\} \/><\/td>/);
});

test("status columns sort in lifecycle order and duration columns sort by elapsed time", () => {
  assert.match(source, /key === "status" \? requestStatusSortRank\(requestStatusLabel\(row\)\) : key === "hours" \? durationLabelMinutes\(row\.hours\)/);
  assert.match(source, /key === "status" \? requestStatusSortRank\(statusLabel\(row\)\)/);
  assert.match(source, /key === "breakdownDays" \? calculateBreakdownMinutes\(row\.start, row\.closedAt, now\)/);
  assert.match(source, /key === "acceptedTime" \? \(elapsedMilliseconds\(row\.start, row\.acceptedAt\) \?\? -1\)/);
  assert.match(source, /sortValue: \(request\) => requestStatusSortRank\(reportRequestStatus\(request\)\)/);
});

test("dashboard drilldowns show the request's daily updates inline", () => {
  assert.match(browser, /Remarks = null \}\) \{/);
  assert.match(browser, /const showUpdatesColumn = Boolean\(Remarks\) && \(requestRecords \|\| bdBalanceColumns\);/);
  assert.match(browser, /\{showUpdatesColumn && bdBalanceColumns && <th>Daily updates<\/th>\}<th>Equipment group<\/th>/);
  assert.match(browser, /\{showUpdatesColumn && !bdBalanceColumns && <th>Daily updates<\/th>\}\{showClosedColumn && <th>Closed<\/th>\}/);
  assert.equal((browser.match(/<td data-sort-value=\{latestUpdateStamp\(record\.dailyRemarks\)\}><Remarks remarks=\{record\.dailyRemarks\} \/><\/td>/g) || []).length, 2);
  assert.match(source, /dailyRemarks: Array\.isArray\(request\.dailyRemarks\) \? request\.dailyRemarks : \[\],/);
  assert.ok((source.match(/<DashboardRecordBrowser [^\n]*?Remarks=\{MaintenanceRemarks\}/g) || []).length >= 2, "both drilldown hosts pass the updates cell");
  const metrics = fs.readFileSync(new URL("../dashboard-equipment-metrics.mjs", import.meta.url), "utf8");
  assert.match(metrics, /dailyRemarks: Array\.isArray\(current\?\.dailyRemarks\) \? current\.dailyRemarks : \[\],/);
});
