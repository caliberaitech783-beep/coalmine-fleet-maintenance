import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDepartmentReports} from '../department-reports.mjs';
import {buildDirectorReportTables,buildXlsxWorkbookBuffer} from '../director-report-bundle.mjs';
import {buildTableExportPdf} from '../table-export-pdf.mjs';

const stamp=time=>`2026-09-08 ${time}`;
const base={status:'Closed',site:'Synthetic QA',door:'D01',owner:'Production actor',acceptedBy:'Maintenance actor',closedBy:'Maintenance actor',firstTripBy:'MIS actor',verifiedBy:'MIS actor'};
const r1=Object.freeze({...base,ref:'R1',start:stamp('20:28:32'),acceptedAt:stamp('20:36:26'),closedAt:stamp('20:37:47'),firstTripAt:stamp('20:39:50'),verifiedAt:stamp('20:42:08')});
const r4=Object.freeze({...base,ref:'R4',start:stamp('22:03:40'),acceptedAt:stamp('22:06:49'),closedAt:stamp('22:07:45'),firstTripAt:stamp('22:10:09'),verifiedAt:stamp('22:10:56')});
const summary=rows=>buildDepartmentReports({requests:rows}).find(report=>report.title==='Summary Report');
const value=(report,row,key)=>report.columns.find(column=>column.key===key).value(row);

test('observed R1 and R4 timings exclude duplicate maintenance time and show every second',()=>{
  const report=summary([r1,r4]);
  for(const [row,expected] of [[r1,['7m 54s','1m 21s','2m 3s','11m 18s','9m 15s','2m 18s']],[r4,['3m 9s','56s','2m 24s','6m 29s','4m 5s','47s']]]){
    assert.deepEqual(['waitingTat','maintenanceTat','returnToWorkTat','overallTat','repairElapsed','verificationLag'].map(key=>value(report,row,key)),expected);
    assert.equal(value(report,row,'ref'),row.ref);
    for(const key of ['acceptedAt','closedAt','firstTripAt','verifiedAt'])assert.equal(value(report,row,key),row[key]);
  }
  const verificationReport=buildDepartmentReports({requests:[r4]}).find(report=>report.title==='Time Taken for MIS Verification');
  assert.equal(value(verificationReport,r4,'difference'),'3m','existing closure-to-verification report is not redefined as the47s verification lag');
});

test('missing, impossible and reversed event stamps remain explicit instead of becoming zero',()=>{
  const report=summary([r4]);
  for(const acceptedAt of ['', 'not-a-date', '2026-02-30 22:06:49']){
    const row={...r4,acceptedAt};
    assert.equal(value(report,row,'waitingTat'),'Not recorded');
    assert.equal(value(report,row,'maintenanceTat'),'Not recorded');
  }
  const reversed={...r4,acceptedAt:stamp('22:08:00')};
  assert.equal(value(report,reversed,'maintenanceTat'),'Not recorded');
  assert.equal(value(report,{...r4,firstTripAt:stamp('22:02:00')},'overallTat'),'Not recorded');
  assert.equal(value(report,{...r4,verifiedAt:stamp('22:09:00')},'verificationLag'),'Not recorded');
  assert.equal(value(report,{...r4,acceptedAt:r4.closedAt},'maintenanceTat'),'0s','genuine simultaneous events may show zero');
  assert.equal(value(report,{...r4,firstTripAt:'',firstTripDate:'2026-09-08'},'returnToWorkTat'),'Not recorded','date-only first trip cannot silently become midnight');
});

test('equivalent ISO and IST timestamps, including midnight, produce the same elapsed stages',()=>{
  const row={...r4,start:'2026-09-08T18:29:30Z',acceptedAt:'2026-09-09 00:00:00',closedAt:'2026-09-08T18:31:00Z',firstTripAt:'2026-09-09 00:01:30',verifiedAt:'2026-09-08T18:32:00Z'};
  const report=summary([row]);
  assert.deepEqual(['waitingTat','maintenanceTat','returnToWorkTat','overallTat','repairElapsed','verificationLag'].map(key=>value(report,row,key)),['30s','1m 0s','30s','2m 0s','1m 30s','30s']);
});

test('Idle manager closure is identified without inventing a repair-completion event or event source',()=>{
  const row={...r4,idealRequestedAt:stamp('22:07:00'),idealApprovedAt:r4.closedAt,idealApprovedBy:'Site manager',closedBy:'Site manager',idleReason:'No work'};
  const report=summary([row]);
  assert.equal(value(report,row,'closureEvent'),'Manager on-road closure | Site manager');
  assert.match(report.columns.find(column=>column.key==='closedAt').label,/on-road approval/);
  assert.match(report.description,/not a separately recorded repair completion/);
  assert.equal(value(report,row,'maintenanceTat'),'56s');
  assert.equal(report.columns.at(-1).key,'closureEvent','closure type is the last column');
  assert.equal(report.columns.at(-2).key,'ref','job reference sits beside closure type at the end');
  assert.equal(report.columns[0].key,'site','location leads the summary');
  assert.ok(!report.columns.some(column=>['chassis','timingNotes'].includes(column.key)));
  assert.equal(value(report,{...r4,closedBy:''},'closureEvent'),'Maintenance closure | Actor not recorded');
  assert.equal(value(report,{...r4,closedAt:''},'closureEvent'),'Closure time not recorded | Maintenance actor');
});

test('Summary UI values and scheduled Excel/PDF data share the same 19-column definitions',async()=>{
  const rows=Object.freeze([r1,r4]);
  const before=JSON.stringify(rows);
  const report=summary(rows);
  const table=buildDirectorReportTables({requests:rows,now:new Date('2026-09-08T23:00:00+05:30')}).find(table=>table.title==='Summary Report');
  assert.equal(report.columns.length,19);
  assert.deepEqual(table.columns.map(column=>column.key),report.columns.map(column=>column.key));
  for(const [index,row] of rows.entries())for(const key of ['waitingTat','maintenanceTat','returnToWorkTat','overallTat','repairElapsed','verificationLag','closureEvent']){
    assert.equal(table.rows[index][table.columns.findIndex(column=>column.key===key)],value(report,row,key));
  }
  const workbook=buildXlsxWorkbookBuffer(table.title,table.columns,table.rows);
  assert.ok(workbook.includes(Buffer.from('11m 18s')));
  assert.ok(workbook.includes(Buffer.from('6m 29s')));
  const pdf=await buildTableExportPdf({title:table.title,columns:table.columns,rows:table.rows});
  const fragments=[...pdf.toString('latin1').matchAll(/<([0-9a-f]+)>/gi)].map(match=>Buffer.from(match[1],'hex').toString('latin1')).join('');
  assert.match(fragments,/11m 18s/);
  assert.match(fragments,/6m 29s/);
  assert.equal(JSON.stringify(rows),before,'reports must not alter the source requests');
});
