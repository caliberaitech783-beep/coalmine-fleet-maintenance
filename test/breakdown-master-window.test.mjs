import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  BREAKDOWN_MASTER_RECENT_DAYS, isRecentBreakdownRow, recentBreakdownCutoff, recentBreakdownRows,
} from "../src/breakdown-master-window.mjs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the window is seven days ending today, across month and year ends", () => {
  assert.equal(BREAKDOWN_MASTER_RECENT_DAYS, 7);
  assert.equal(recentBreakdownCutoff("2026-11-13"), "2026-11-07");
  assert.equal(recentBreakdownCutoff("2026-11-03"), "2026-10-28");
  assert.equal(recentBreakdownCutoff("2027-01-02"), "2026-12-27");
  assert.equal(recentBreakdownCutoff("2028-03-02"), "2028-02-25");
  assert.equal(recentBreakdownCutoff("2026-11-13", 1), "2026-11-13");
  assert.equal(recentBreakdownCutoff("2026-11-13", 0), "2026-11-07", "an unusable length falls back to seven days");
  assert.equal(recentBreakdownCutoff("13-11-2026"), "");
  assert.equal(recentBreakdownCutoff(""), "");
});

test("every request that is not closed stays, however old", () => {
  const cutoff = "2026-11-07";
  for (const status of ["Open", "Accepted", "In progress", "Awaiting parts", "Running BD", "Idle", "Ideal", " open ", "", undefined]) {
    assert.equal(isRecentBreakdownRow({status, start: "2026-08-30 09:00:00"}, cutoff), true, String(status));
  }
});

test("a closed request stays when it was opened, closed or verified inside the window", () => {
  const cutoff = "2026-11-07";
  const old = {status: "Closed", vehicleIdle: false, start: "2026-10-01 09:00:00", createdAt: "2026-10-01 09:00:00", closedAt: "2026-10-02 18:00:00"};
  assert.equal(isRecentBreakdownRow(old, cutoff), false);
  assert.equal(isRecentBreakdownRow({...old, closedAt: "2026-11-07 00:00:05"}, cutoff), true, "closed on the first day of the window");
  assert.equal(isRecentBreakdownRow({...old, closedAt: "2026-11-06 23:59:59"}, cutoff), false, "closed the evening before");
  assert.equal(isRecentBreakdownRow({...old, verifiedAt: "2026-11-12 10:00:00"}, cutoff), true, "verified this week");
  assert.equal(isRecentBreakdownRow({...old, start: "2026-11-10 08:00:00"}, cutoff), true);
  assert.equal(isRecentBreakdownRow({...old, status: " CLOSED "}, cutoff), false);
});

test("a closed request with the vehicle still idle is live work and stays", () => {
  const cutoff = "2026-11-07";
  assert.equal(isRecentBreakdownRow({status: "Closed", vehicleIdle: true, start: "2026-09-01 09:00:00", closedAt: "2026-09-02 09:00:00"}, cutoff), true);
  assert.equal(isRecentBreakdownRow({status: "Closed", idealRequestedAt: "2026-09-02 10:00:00", start: "2026-09-01 09:00:00"}, cutoff), true);
  assert.equal(isRecentBreakdownRow({status: "Closed", idealRequestedAt: "2026-09-02 10:00:00", idealApprovedAt: "2026-09-03 10:00:00", start: "2026-09-01 09:00:00"}, cutoff), false);
});

test("a record that cannot be dated, or a missing cutoff, hides nothing", () => {
  assert.equal(isRecentBreakdownRow({status: "Closed", vehicleIdle: false}, "2026-11-07"), true);
  assert.equal(isRecentBreakdownRow({status: "Closed", vehicleIdle: false, start: "not a date"}, "2026-11-07"), true);
  assert.equal(isRecentBreakdownRow({status: "Closed", vehicleIdle: false, start: "2026-01-01 09:00:00"}, ""), true);
  const rows = [{ref: "A", status: "Closed", vehicleIdle: false, start: "2026-01-01 09:00:00"}];
  assert.deepEqual(recentBreakdownRows(rows, {today: "bad"}), {rows, total: 1, hidden: 0, cutoff: ""});
  assert.deepEqual(recentBreakdownRows(null, {today: "2026-11-13"}), {rows: [], total: 0, hidden: 0, cutoff: "2026-11-07"});
});

test("the selection keeps order and the same row objects, and reports what it hid", () => {
  const rows = [
    {ref: "new-closed", status: "Closed", vehicleIdle: false, start: "2026-11-12 09:00:00", closedAt: "2026-11-12 15:00:00"},
    {ref: "old-open", status: "In progress", start: "2026-09-15 09:00:00"},
    {ref: "old-closed", status: "Closed", vehicleIdle: false, start: "2026-09-15 09:00:00", closedAt: "2026-09-16 09:00:00"},
    {ref: "manual-undated", status: "Closed", vehicleIdle: false},
    {ref: "old-closed-2", status: "Closed", vehicleIdle: false, createdAt: "2026-10-20 09:00:00", closedAt: "2026-10-21 09:00:00"},
  ];
  const result = recentBreakdownRows(rows, {today: "2026-11-13"});
  assert.deepEqual(result.rows.map((row) => row.ref), ["new-closed", "old-open", "manual-undated"]);
  assert.equal(result.rows[1], rows[1]);
  assert.deepEqual({total: result.total, hidden: result.hidden, cutoff: result.cutoff}, {total: 5, hidden: 2, cutoff: "2026-11-07"});
  assert.equal(recentBreakdownRows(rows, {today: "2026-11-13", days: 60}).hidden, 0);
});

test("Breakdown master opens on the window, keeps the full export and offers every request", () => {
  const breakdown = source.slice(source.indexOf("Breakdown = function BreakdownWithMasterEntry"), source.indexOf("const OriginalEquipment"));
  assert.match(source, /import \{ BREAKDOWN_MASTER_RECENT_DAYS, recentBreakdownRows \} from "\.\/breakdown-master-window\.mjs";/);
  assert.match(breakdown, /const \[showAllRows, setShowAllRows\] = useState\(false\);/, "the screen opens on the window");
  assert.match(breakdown, /const recentRows = useMemo\(\(\) => recentBreakdownRows\(allRows, \{today: localDateKey\(new Date\(\)\)\}\)\.rows, \[allRows\]\);/);
  assert.match(breakdown, /const rows = showAllRows \? allRows : recentRows;/);
  assert.match(breakdown, /<MasterActions name="Breakdown master" records=\{allRows\}/, "the header export is never narrowed");
  assert.match(breakdown, /onClick=\{\(\) => setShowAllRows\(\(current\) => !current\)\}/);
  assert.match(breakdown, /Show all requests \(slower\)/);
  assert.match(breakdown, /recentRows\.length < allRows\.length && <p className="breakdown-master-window" role="status"/, "the note appears only when something is hidden");
  const hooks = breakdown.slice(0, breakdown.indexOf("if ((loadError && !loaded)"));
  assert.match(hooks, /useState\(false\)[\s\S]*useMemo[\s\S]*useMemo/, "hooks run before the loading and error returns");
});
