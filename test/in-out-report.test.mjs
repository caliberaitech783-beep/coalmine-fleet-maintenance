import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {
  IN_OUT_REPORT_COLUMNS,
  IN_OUT_REPORT_TITLE,
  buildInOutReportRows,
  indiaDateKey,
  locationCountLabel,
  minutesLabel,
  requestEventDateKey,
  signedCount,
  summarizeInOutReport,
  vehicleListLabel,
} from '../in-out-report.mjs';
import {DIRECTOR_REPORT_TITLES,buildDirectorReportTables} from '../director-report-bundle.mjs';

const requests=[
  {ref:'REQ-1',equipment:'EX-1',site:'Sasti OB',status:'Open',start:'2026-09-01 08:00'},
  {ref:'REQ-2',equipment:'TR-1',site:'Jayant OB',status:'Closed',start:'2026-09-01 09:00',closedAt:'2026-09-02 12:00',verifiedAt:'2026-09-03 13:00'},
  {ref:'REQ-3',equipment:'ID-1',site:'Majri OB',status:'Idle',idleReason:'No driver',start:'2026-09-01 10:00',closedAt:'2026-09-01 11:00'},
  {ref:'REQ-4',equipment:'DZ-1',site:'Sasti OB',status:'Closed',start:'2026-09-02 06:00',closedAt:'2026-09-02 09:30',verifiedAt:'2026-09-02 10:00'},
  {ref:'REQ-5',equipment:'GR-1',site:'Sasti OB',status:'Open',start:'2026-09-03 07:15'},
];

test('India date helpers bucket workflow timestamps by IST calendar day',()=>{
  assert.equal(indiaDateKey(new Date('2026-09-02T20:30:00Z')),'2026-09-03');
  assert.equal(indiaDateKey(new Date('2026-09-02T13:30:00Z')),'2026-09-02');
  assert.equal(requestEventDateKey({start:'2026-09-01 08:00'},'opened'),'2026-09-01');
  assert.equal(requestEventDateKey({createdAt:'2026-09-04T05:00:00.000Z'},'opened'),'2026-09-04');
  assert.equal(requestEventDateKey({closedAt:'2026-09-02 12:00'},'closed'),'2026-09-02');
  assert.equal(requestEventDateKey({status:'Idle',start:'2026-09-01 10:00'},'idle'),'2026-09-01');
});

test('In and Out rows count vehicles in, out, verified, idle and the balance left in workshop per day',()=>{
  const rows=buildInOutReportRows(requests,{today:'2026-09-03'});
  assert.deepEqual(rows.map((row)=>row.date),['2026-09-03','2026-09-02','2026-09-01']);
  const [latest,middle,first]=rows;
  assert.equal(first.weekday,'Tuesday');
  assert.equal(first.opened,3);
  assert.equal(first.closed,0);
  assert.equal(first.idle,1);
  assert.equal(first.net,3);
  assert.equal(first.pendingClose,2);
  assert.equal(first.pendingVerification,1);
  assert.equal(first.inVehicles,'EX-1, TR-1, ID-1');
  assert.equal(first.inLocations,'Jayant OB (1), Majri OB (1), Sasti OB (1)');
  assert.equal(middle.opened,1);
  assert.equal(middle.closed,2);
  assert.equal(middle.verified,1);
  assert.equal(middle.net,-1);
  assert.equal(middle.pendingClose,1);
  assert.equal(middle.pendingVerification,2);
  assert.equal(middle.outVehicles,'TR-1, DZ-1');
  assert.equal(middle.outLocations,'Jayant OB (1), Sasti OB (1)');
  assert.equal(middle.averageTat,'15h 15m');
  assert.equal(latest.opened,1);
  assert.equal(latest.closed,0);
  assert.equal(latest.verified,1);
  assert.equal(latest.pendingClose,2);
  assert.equal(latest.pendingVerification,1);
  assert.equal(latest.averageTat,'—');
});

test('In and Out summary totals the period and keeps the latest balance',()=>{
  const summary=summarizeInOutReport(buildInOutReportRows(requests,{today:'2026-09-03'}));
  assert.equal(summary.days,3);
  assert.equal(summary.from,'2026-09-01');
  assert.equal(summary.to,'2026-09-03');
  assert.equal(summary.opened,5);
  assert.equal(summary.closed,2);
  assert.equal(summary.verified,2);
  assert.equal(summary.idle,1);
  assert.equal(summary.net,3);
  assert.equal(summary.pendingClose,2);
  assert.equal(summary.pendingVerification,1);
  assert.equal(summary.averageTat,'15h 15m');
  assert.equal(summary.busiestInDay,'2026-09-01');
  assert.equal(summary.busiestOutDay,'2026-09-02');
});

test('In and Out rows always include today, ignore future events and cap the history window',()=>{
  const empty=buildInOutReportRows([],{today:'2026-09-03'});
  assert.equal(empty.length,1);
  assert.equal(empty[0].date,'2026-09-03');
  assert.equal(empty[0].opened,0);
  const future=buildInOutReportRows([{ref:'F',start:'2026-09-09 08:00'}],{today:'2026-09-03'});
  assert.equal(future.length,1);
  const capped=buildInOutReportRows([{ref:'OLD',start:'2020-01-01 08:00',status:'Closed',closedAt:'2020-01-02 08:00'}],{today:'2026-09-03',maxDays:30});
  assert.equal(capped.length,30);
  assert.equal(capped[capped.length-1].date,'2026-08-05');
  assert.equal(capped[0].pendingClose,0);
});

test('label helpers format vehicle lists, location counts, net movement and durations',()=>{
  assert.equal(vehicleListLabel([{equipment:'A'},{door:'D-2'},{ref:'R-3'}],2),'A, D-2 +1 more');
  assert.equal(locationCountLabel([{site:'B'},{site:'A'},{site:'B'},{}]),'B (2), A (1), Not assigned (1)');
  assert.equal(signedCount(3),'+3');
  assert.equal(signedCount(-2),'-2');
  assert.equal(signedCount(0),'0');
  assert.equal(minutesLabel(1535),'1d 1h 35m');
  assert.equal(minutesLabel(null),'—');
});

test('In and Out report ships in the director bundle and the General Report tab',()=>{
  assert.equal(DIRECTOR_REPORT_TITLES.at(-1),IN_OUT_REPORT_TITLE);
  const tables=buildDirectorReportTables({requests,now:new Date('2026-09-03T05:00:00Z')});
  const inOut=tables.find((table)=>table.title===IN_OUT_REPORT_TITLE);
  assert.equal(inOut.department,'General');
  assert.deepEqual(inOut.columns.map((column)=>column.key),IN_OUT_REPORT_COLUMNS.map((column)=>column.key));
  assert.equal(inOut.rows.length,3);
  const column=(key)=>inOut.columns.findIndex((item)=>item.key===key);
  assert.equal(inOut.rows[2][column('opened')],'3');
  assert.equal(inOut.rows[1][column('closed')],'2');
  assert.equal(inOut.rows[1][column('net')],'-1');
  assert.equal(inOut.rows[0][column('pendingClose')],'2');
  const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const styles=readFileSync(new URL('../src/reports-workspace.css',import.meta.url),'utf8');
  assert.match(source,/from "\.\.\/in-out-report\.mjs"/);
  assert.match(source,/category: "general", title: IN_OUT_REPORT_TITLE/);
  assert.match(source,/buildInOutReportRows\(reportRequests\)/);
  assert.match(source,/rowKey: \(row\) => `in-out-\$\{row\.date\}`/);
  assert.doesNotMatch(source,/InOutReportSummary/);
  assert.match(styles,/\.in-out-net\.positive/);
});
