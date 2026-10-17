import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {breakdownMeterValue,breakdownMeterFields,latestBreakdownMeterValue,withBreakdownMeterColumns} from '../breakdown-meter-columns.mjs';
import {buildDepartmentReports} from '../department-reports.mjs';
import {buildDirectorReportTables} from '../director-report-bundle.mjs';
import {FLEET_ACTIVITY_COLUMNS,fleetActivityTable} from '../site-consolidated-report.mjs';
import {hourlyBreakdownEvents} from '../src/hourly-breakdown.mjs';

const tipper={ref:'REQ-1',door:'T-12',site:'Pakri Barwadih',status:'Closed',equipmentGroup:'Tipper',complaint:'Brake failure',category:'Mechanical',
  start:'2026-09-20 08:00:00',acceptedAt:'2026-09-20 08:10:00',closedAt:'2026-09-20 14:00:00',verifiedAt:'2026-09-20 15:00:00',firstTripAt:'2026-09-20 14:30:00',
  meterType:'KMR',openingMeterReadings:{HMR:'5120',KMR:'80211'},closingMeterReadings:{HMR:'5126',KMR:'80230'}};
const dozer={ref:'REQ-2',door:'D-3',site:'Pakri Barwadih',status:'Open',complaint:'Hydraulic leak',start:'2026-09-21 09:00:00',meterType:'HMR',openingMeterReading:'1402'};

test('meter values read saved readings, legacy single readings and dashes for missing ones', () => {
  assert.equal(breakdownMeterValue(tipper,'HMR'),'5120');
  assert.equal(breakdownMeterValue(tipper,'KMR','closing'),'80230');
  assert.equal(breakdownMeterValue(dozer,'HMR'),'1402');
  assert.equal(breakdownMeterValue(dozer,'KMR'),'—');
  assert.equal(breakdownMeterValue(dozer,'HMR','closing'),'—');
  assert.equal(breakdownMeterValue(null,'HMR'),'—');
  assert.equal(latestBreakdownMeterValue(tipper,'KMR'),'80230');
  assert.equal(latestBreakdownMeterValue(dozer,'HMR'),'1402');
  assert.deepEqual(breakdownMeterFields(tipper),{hmr:'5120',kmr:'80211',closingHmr:'5126',closingKmr:'80230'});
  assert.deepEqual(breakdownMeterFields(dozer),{hmr:'1402',kmr:undefined,closingHmr:undefined,closingKmr:undefined});
});

test('meter columns sit beside the breakdown reason and closing readings beside the closing time', () => {
  const keys=columns=>columns.map(column=>column.key);
  const columns=[{key:'door'},{key:'model'},{key:'complaint'},{key:'closedAt'},{key:'ref'}];
  assert.deepEqual(keys(withBreakdownMeterColumns(columns)),['door','model','complaint','openingHmr','openingKmr','closedAt','ref']);
  assert.deepEqual(keys(withBreakdownMeterColumns(columns,{closing:true})),['door','model','complaint','openingHmr','openingKmr','closedAt','closingHmr','closingKmr','ref']);
  assert.deepEqual(keys(withBreakdownMeterColumns([{key:'door'},{key:'model'},{key:'status'}],{closing:true})),['door','model','openingHmr','openingKmr','closingHmr','closingKmr','status']);
  const already=withBreakdownMeterColumns(columns);
  assert.equal(withBreakdownMeterColumns(already,{closing:true}),already);
});

test('every department breakdown report carries HMR and KMR; asset and count reports do not', () => {
  const reports=buildDepartmentReports({requests:[tipper,dozer],equipmentRecords:[],from:'2026-09-01',to:'2026-09-30',now:new Date('2026-09-22T00:00:00+05:30')});
  const assetReports=new Set(['Availability Report','Total Fleet','Total In and out count report']);
  const openOnly=new Set(['Open Off road Cases','Maintenance Status Pending']);
  for(const report of reports){
    const keys=report.columns.map(column=>column.key);
    if(assetReports.has(report.title)){assert.ok(!keys.includes('openingHmr'),report.title);continue;}
    assert.ok(keys.includes('openingHmr')&&keys.includes('openingKmr'),report.title);
    assert.equal(keys.includes('closingHmr'),!openOnly.has(report.title),report.title);
  }
  const tat=reports.find(report=>report.title==='Turn Around Time for Repair');
  const hmr=tat.columns.find(column=>column.key==='closingHmr');
  assert.equal(hmr.value(tat.rows[0]),'5126');
});

test('director tables print opening and closing readings for breakdown cases', () => {
  const tables=buildDirectorReportTables({requests:[tipper,dozer],now:new Date('2026-09-22T00:00:00+05:30')});
  const opened=tables.find(table=>table.title==='Location wise opened BD');
  assert.ok(opened.columns.some(column=>column.label==='Opening HMR'));
  assert.ok(!opened.columns.some(column=>column.label==='Closing HMR'));
  const closed=tables.find(table=>table.title==='Location wise closing BD');
  const labels=closed.columns.map(column=>column.label);
  const row=closed.rows[0];
  assert.equal(row[labels.indexOf('Opening KMR')],'80211');
  assert.equal(row[labels.indexOf('Closing KMR')],'80230');
  const recent=tables.find(table=>table.title==='Recent Breakdown Cases');
  assert.ok(['Opening HMR','Opening KMR','Closing HMR','Closing KMR'].every(label=>recent.columns.some(column=>column.label===label)));
});

test('site activity report hides closing readings for cases still open at window end', () => {
  const labels=FLEET_ACTIVITY_COLUMNS.map(column=>column.label);
  const at=label=>labels.indexOf(label);
  const window={start:new Date('2026-09-20T07:00:00+05:30'),end:new Date('2026-09-20T12:00:00+05:30')};
  const [row]=fleetActivityTable([tipper],window).rows;
  assert.equal(row[at('Opening HMR')],'5120');
  assert.equal(row[at('Closing HMR')],'—');
  const [later]=fleetActivityTable([tipper],{start:window.start,end:new Date('2026-09-20T18:00:00+05:30')}).rows;
  assert.equal(later[at('Closing KMR')],'80230');
});

test('hourly BD In shows opening readings and BD Out shows closing readings', () => {
  const events=hourlyBreakdownEvents([tipper],10,Date.parse('2026-09-20T15:00:00+05:30'));
  assert.deepEqual(events.map(event=>[event.direction,event.hmr,event.kmr]),[['Out','5126','80230'],['In','5120','80211']]);
  const view=fs.readFileSync(new URL('../src/hourly-breakdown-view.jsx',import.meta.url),'utf8');
  assert.match(view,/<th>In\/Out<\/th><th>HMR<\/th><th>KMR<\/th>/);
});

test('dashboard breakdown tables always show opening HMR and KMR', () => {
  const browser=fs.readFileSync(new URL('../src/dashboard-record-browser.jsx',import.meta.url),'utf8');
  assert.match(browser,/<th>Model<\/th><th>Opening HMR<\/th><th>Opening KMR<\/th>\{showClosingMeters/);
  const main=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.match(main,/\["openingHmr", "Opening HMR"\], \["openingKmr", "Opening KMR"\]/);
  assert.match(main,/\.\.\.breakdownMeterFields\(request, equipment \? \[equipment\] : \[\]\)/);
  assert.match(main,/workspaceReportTitles\.idle\} showMakeModel showReason showCreatedBy showTurnaroundTime showMeterData/);
});
