import assert from "node:assert/strict";
import test from "node:test";
import { indiaDateTimeEpoch, reportRowsWithinRange, validReportDateRange } from "../report-date-range.mjs";

test("report date ranges use IST and include exact boundaries", () => {
  assert.equal(indiaDateTimeEpoch("2026-09-02 08:00"), Date.parse("2026-09-02T08:00:00+05:30"));
  assert.equal(validReportDateRange("2026-09-02T08:00", "2026-09-02T18:00"), true);
  assert.equal(validReportDateRange("2026-09-02T18:00", "2026-09-02T08:00"), false);

  const rows = [
    { id: 1, at: "2026-09-02 07:59" },
    { id: 2, at: "2026-09-02 08:00" },
    { id: 3, at: "2026-09-02 18:00" },
    { id: 4, at: "2026-09-02 18:01" },
    { id: 5, at: "" },
  ];
  assert.deepEqual(
    reportRowsWithinRange(rows, (row) => row.at, "2026-09-02T08:00", "2026-09-02T18:00").map((row) => row.id),
    [2, 3],
  );
});

test("current snapshot reports can explicitly retain undated rows", () => {
  const rows = [{ id: 1, at: "" }];
  assert.deepEqual(reportRowsWithinRange(rows, (row) => row.at, "2026-09-02T08:00", "2026-09-02T18:00"), []);
  assert.deepEqual(reportRowsWithinRange(rows, (row) => row.at, "2026-09-02T08:00", "2026-09-02T18:00", { includeUndated: true }), rows);
});

test('date-only report ranges include the full final day in IST',()=>{
  const rows=[{at:'2026-09-02 23:59:59.999'},{at:'2026-09-03 00:00:00'},{at:'2026-09-02T18:29:59Z'}];
  assert.deepEqual(reportRowsWithinRange(rows,row=>row.at,'2026-09-02','2026-09-02'),[rows[0],rows[2]]);
  assert.equal(indiaDateTimeEpoch('2026-09-02 · 23:15:00'),Date.parse('2026-09-02T23:15:00+05:30'));
  const date=new Date('2026-09-02T23:15:00+05:30');
  assert.equal(indiaDateTimeEpoch(date),date.getTime());
});
