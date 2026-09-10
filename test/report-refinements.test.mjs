import test from 'node:test';
import assert from 'node:assert/strict';
import {maintenanceDelay,pendingRemark,olderThanTenDays,availabilityPercentage,reportPdfHeading,recentBreakdownStatus} from '../report-refinements.mjs';
import {buildDirectorReportTables} from '../director-report-bundle.mjs';
import {buildDepartmentReports,availabilityRows} from '../department-reports.mjs';
import {visibleInMisRequests} from '../src/mis-history.mjs';
const now = new Date('2026-09-08T12:00:00+05:30');
test('pending delay uses acceptance, and No Update begins strictly after 24 hours',()=>{
  assert.equal(maintenanceDelay({},now),'Not accepted');
  assert.equal(pendingRemark({acceptedAt:'2026-09-07 12:00:00'},now),'No Remark');
  assert.equal(pendingRemark({acceptedAt:'2026-09-07 11:59:59',dailyRemarks:[{remark:'Earlier update'}]},now),'No Update');
  assert.equal(pendingRemark({acceptedAt:'2026-09-08 10:00:00',dailyRemarks:[{remark:'Working'}]},now),'Working');
  assert.notEqual(maintenanceDelay({acceptedAt:'2026-09-08 10:00:00'},now),'Not accepted');
});
test('pending remarks use the freshest update regardless of API ordering or acceptance age',()=>{
  const recent={remark:'Part received; fitting now',createdAt:'2026-09-08 11:00:00'};
  const old={remark:'Waiting for part',createdAt:'2026-09-06 10:00:00'};
  for(const dailyRemarks of [[recent,old],[old,recent]]) {
    assert.equal(pendingRemark({acceptedAt:'2026-09-05 08:00',dailyRemarks},now),recent.remark);
  }
  assert.equal(pendingRemark({acceptedAt:'2026-09-05 08:00',dailyRemarks:[old]},now),'No Update');
  assert.equal(pendingRemark({acceptedAt:'2026-09-05 08:00',dailyRemarks:[{remark:'Exactly one day',createdAt:'2026-09-07 12:00'}]},now),'Exactly one day');
});

test('ten day filter is strictly older than production submission, not acceptance',()=>{
  assert.equal(olderThanTenDays({start:'2026-08-29 12:00:00'},now),false);
  assert.equal(olderThanTenDays({start:'2026-08-29 11:59:59',acceptedAt:'2026-09-08 11:00:00'},now),true);
  assert.equal(olderThanTenDays({},now),false);
});
test('availability and PDF titles retain precise values and unique site names',()=>{
  assert.equal(availabilityPercentage(100),'100%');
  assert.equal(availabilityPercentage(98.994),'98.99%');
  assert.equal(reportPdfHeading('Report',[{site:'Sasti OB'},{site:'Majri OB'},{site:'Sasti OB'}]),'Report - Sasti OB, Majri OB');
  const [row]=availabilityRows([{door:'A'}],[],'2026-09-08T00:00','2026-09-08T12:00',now);
  assert.equal(row.productive,12);
});
test('approved columns and unverified queue match MIS requests',()=>{
  const requests=[{ref:'a',status:'Closed',closedAt:'2026-09-08 10:00'}, {ref:'b',status:'Closed',closedAt:'2026-09-08 10:00',verifiedAt:'2026-09-08 11:00'}, {ref:'c',status:'Open'}, {ref:'d',status:'Closed',closedBy:'sanskar manohare'}];
  const reports=buildDepartmentReports({requests,now,from:'2026-09-01',to:'2026-09-08'});
  assert.deepEqual(reports.find(r=>r.title==='Unverified Cases').rows,requests.filter(r=>r.status==='Closed'&&!r.verifiedAt).filter(visibleInMisRequests));
  assert.deepEqual(reports.find(r=>r.title==='Total Request Submitted Report').columns.map(c=>c.key),['status','site','door','equipmentGroup','model','complaint','category','ref']);
  const columns=reports.find(r=>r.title.includes('Ticket Acceptance')).columns;
  assert.equal(columns[columns.findIndex(c=>c.key==='acceptedAt')-1].key,'submittedAt');
  assert.deepEqual(columns.map(c=>c.key),['status','site','door','equipmentGroup','model','submittedAt','acceptedAt','difference','acceptedBy','ref','complaint','category']);
  assert.deepEqual(reports.find(r=>r.title==='Maintenance Status Pending').columns.map(c=>c.key),['status','site','door','equipmentGroup','model','acceptedAt','delay','remark','complaint','category','ref']);
  for(const title of ['Total Request Submitted Report','Ticket Acceptance from Maintenance (Timelinewise)','Maintenance Status Pending'])assert.ok(!reports.find(r=>r.title===title).columns.some(c=>/chassis/i.test(c.label)),`${title} has no chassis column`);
  assert.equal(reports[0].columns.find(c=>c.key==='acceptedAt').label,'Maintenance Acceptance Date & Time');
});

test('recent breakdown cases lead with status, show Pending after 24 unaccepted hours, and expose TAT',()=>{
  const opened='2026-09-07 11:00:00';
  assert.equal(recentBreakdownStatus({status:'Open',start:opened},now),'Pending','unaccepted for more than 24 hours');
  assert.equal(recentBreakdownStatus({status:'Open',start:'2026-09-07 12:30:00'},now),'Open','within 24 hours keeps the live status');
  assert.equal(recentBreakdownStatus({status:'Open',start:opened,acceptedAt:'2026-09-07 12:00:00'},now),'Open','accepted requests are never Pending');
  assert.equal(recentBreakdownStatus({status:'Closed',start:opened,closedAt:'2026-09-07 15:00:00'},now),'Closed');
  const tables=buildDirectorReportTables({
    requests:[{ref:'REQ-P',door:'D7',site:'Sasti OB',status:'Open',start:opened,model:'PC-210'},{ref:'REQ-C',door:'D8',site:'Jayant OB',status:'Closed',start:opened,closedAt:'2026-09-07 15:30:00',closedBy:'Maintenance User'}],
    equipmentRecords:[{equipmentName:'EX-9',door:'D9',chassisNo:'CH-9',category:'Equipment',currentLocation:'Sasti OB'}],
    transferRecords:[{transferNo:'VT-9',chassisNo:'CH-9',source:'Sasti OB',destination:'Jayant OB',transferDate:'2026-09-01',driver:'Driver A'}],
    now,
  });
  const recent=tables.find(table=>table.title==='Recent Breakdown Cases');
  assert.deepEqual(recent.columns.map(column=>column.key),['status','site','door','model','started','closedAt','tat','reference','createdBy','closedBy']);
  const cell=(row,key)=>row[recent.columns.findIndex(column=>column.key===key)];
  const pending=recent.rows.find(row=>cell(row,'reference')==='REQ-P');
  const closed=recent.rows.find(row=>cell(row,'reference')==='REQ-C');
  assert.equal(cell(pending,'status'),'Pending');
  assert.equal(cell(closed,'status'),'Closed');
  assert.equal(cell(closed,'tat'),'4h 30m');
  const transfer=tables.find(table=>table.title==='Vehicle Transfer Report');
  assert.deepEqual(transfer.columns.map(column=>column.key),['door','transferNo','transferDate','from','to','model','driver']);
  assert.equal(transfer.rows[0][0],'D9','door number resolved from the chassis in the equipment master');
});
