import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDepartmentReports} from '../department-reports.mjs';
import {buildSiteInOutReportRows,buildInOutReportRows,IN_OUT_REPORT_COLUMNS} from '../in-out-report.mjs';

test('MIS reports have the approved column order and wrapping',()=>{
  const reports=buildDepartmentReports();
  const expected={
    '30 Min. Mismatch':['site','door','equipmentGroup','model','category','closedAt','firstTrip','difference','mismatch','complaint','driverName','ref','chassis','verifiedBy'],
    'Unverified Cases':['site','door','equipmentGroup','model','category','closedAt','delay','complaint','ref','chassis'],
    'MIS Turn Around Time':['site','door','equipmentGroup','model','category','closedAt','verifiedAt','firstTripAt','closeToMis','closeToFirstTrip','firstTripToMis','complaint','verifiedBy','ref','chassis'],
    'Total Fleet':['site','door','equipmentName','model','make','itemSpecification','chassis'],
    'Total In and out count report':['site','date','opened','closed','net','pendingClose','verified','idle','pendingVerification','averageTat'],
    'MIS Red Flag Report':['site','door','equipmentGroup','model','category','ref','misFlaggedAt','misFlaggedBy','misFlagRemark','closedAt','closedBy','chassis'],
  };
  for(const [title,keys] of Object.entries(expected)) assert.deepEqual(reports.find(r=>r.title===title).columns.map(c=>c.key),keys,title);
  assert.equal(reports.find(r=>r.title==='30 Min. Mismatch').columns.find(c=>c.key==='difference').label,'TAT');
  assert.ok(reports.find(r=>r.title==='Total In and out count report').columns.every(c=>c.wrap&&c.wrapHeader));
  assert.ok(reports.find(r=>r.title==='MIS Turn Around Time').columns.filter(c=>['closeToMis','closeToFirstTrip','firstTripToMis'].includes(c.key)).every(c=>c.wrapHeader));
});

test('MIS daily counts stay separate by location without changing the General register',()=>{
  const requests=[
    {site:'Sasti OB',start:'2026-09-09 08:00',closedAt:'2026-09-10 10:00'},
    {site:'Majri OB',start:'2026-09-09 09:00'},
  ];
  const options={today:new Date('2026-09-10T12:00:00+05:30')};
  const rows=buildSiteInOutReportRows(requests,options);
  assert.equal(rows.length,4);
  const sasti=rows.find(r=>r.date==='2026-09-10'&&r.site==='Sasti OB');
  const majri=rows.find(r=>r.date==='2026-09-10'&&r.site==='Majri OB');
  assert.equal(sasti.closed,1);assert.equal(sasti.net,-1);assert.equal(sasti.pendingClose,0);
  assert.equal(majri.closed,0);assert.equal(majri.pendingClose,1);
  assert.equal(buildInOutReportRows(requests,options).length,2);
  assert.ok(IN_OUT_REPORT_COLUMNS.some(c=>c.key==='weekday'));
  assert.deepEqual(buildSiteInOutReportRows([],options),[]);
});
