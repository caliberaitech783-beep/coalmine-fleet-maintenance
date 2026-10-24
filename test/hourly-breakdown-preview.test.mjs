import test from 'node:test';
import assert from 'node:assert/strict';
import {buildHourlyBreakdownPreview,registerHourlyBreakdownPreview,HOURLY_PREVIEW_COLUMNS} from '../hourly-breakdown-preview.mjs';

test('preview follows existing global retirement and owner visibility rules',()=>{
 const base={site:'Sasti OC',start:'2026-09-01 10:00:00'};
 const result=buildHourlyBreakdownPreview([
  {...base,ref:'REQ-1788930790041'},
  {...base,ref:'hidden',owner:'Stupal Moon',createdAt:'2026-09-09 10:00:00'},
  {...base,ref:'current',owner:'Stupal Moon',createdAt:'2026-09-10 10:00:00'},
 ],'2026-10-23T12:00:00+05:30');
 assert.equal(result.counts['Opening BD'],1);
 assert.equal(result.rows.length,1);
});

test('site preview separates period activity, continuing BD, first trip and idle without OEM columns',()=>{
 const cutoff='2026-10-23T12:00:00+05:30';
 const base={site:'Sasti OC',equipmentGroup:'Tipper',category:'Electrical'};
 const source=[
  {...base,ref:'old',door:'A',start:'2026-10-20 10:00:00'},
  {...base,ref:'new',door:'B',start:'2026-10-23 10:30:00'},
  {...base,ref:'closed',door:'C',start:'2026-10-23 08:00:00',closedAt:'2026-10-23 11:00:00',idealRequestedAt:'2026-10-23 11:00:00',openingMeterReadings:{KMR:'100',HMR:'20'},closingMeterReadings:{KMR:'104',HMR:'22'}},
  {...base,ref:'out',door:'D',start:'2026-10-23 07:00:00',closedAt:'2026-10-23 09:00:00',productionFirstTripAt:'2026-10-23 11:30:00'},
  {...base,ref:'other',door:'E',site:'Majri OC',start:'2026-10-23 10:30:00'},
  {...base,ref:'future',door:'F',start:'2026-10-23 12:00:01'},
 ];
 const result=buildHourlyBreakdownPreview(source,cutoff);
 assert.deepEqual(result.counts,{'Opening BD':2,'New BD':1,'Closing BD':1,'Previous BD':1,'Previous Close':1,'Total Idle Now':1});
 assert.deepEqual(result.rows.map(row=>row[0]),['🔴 IN','🔴 Continuing BD','🟢 CLOSED','🟢 OUT','🟠 IDLE']);
 assert.equal(result.rows.find(row=>row[0]==='🟢 CLOSED')[6],'4');
 assert.equal(result.rows.find(row=>row[0]==='🟢 CLOSED')[7],'2');
 assert.equal(result.rows.find(row=>row[0]==='🔴 IN')[6],'—');
 assert.equal(result.rows.length,5);
 assert.ok(!HOURLY_PREVIEW_COLUMNS.some(label=>/OEM|Opening [KH]MR|Closing [KH]MR/.test(label)));
});

test('window end is exclusive and later remarks and closures do not leak into the snapshot',()=>{
 const result=buildHourlyBreakdownPreview([{site:'Sasti OB',door:'A',start:'2026-10-23 09:00:00',closedAt:'2026-10-23 12:00:00',dailyRemarks:[{createdAt:'2026-10-23 11:30:00',remark:'Current work'},{createdAt:'2026-10-23 12:00:00',remark:'Next window'}]}],'2026-10-23T12:00:00+05:30');
 assert.equal(result.counts['Closing BD'],0);
 assert.equal(result.rows[0][9],'Pending');
 assert.match(result.rows[0][5],/Current work/);
 assert.doesNotMatch(result.rows[0][5],/Next window/);
});

test('manual site preview is an authenticated administrator GET and uses a read-only snapshot',()=>{
 let route;const session=()=>{},admin=()=>{};
 registerHourlyBreakdownPreview({get:(...args)=>route=args},{pool:{},requireSession:session,requireAdministrator:admin});
 assert.equal(route[0],'/api/reports/hourly-breakdown-preview');assert.equal(route[1],session);assert.equal(route[2],admin);
});

test('daily update precedes differences calculated as closing minus opening',()=>{
 const report=buildHourlyBreakdownPreview([{site:'Sasti OC',door:'A',equipmentGroup:'Tipper',start:'2026-10-23 09:00:00',openingMeterReadings:{KMR:'100.25',HMR:'20.5'},closingMeterReadings:{KMR:'104.75',HMR:'22.75'},dailyRemarks:[{createdAt:'2026-10-23 11:00:00',remark:'Repair ongoing'}]}],'2026-10-23T12:00:00+05:30');
 assert.deepEqual(report.columns.slice(5,8),['Daily Update','Diff KMR','Diff. HMR']);
 assert.match(report.rows[0][5],/Repair ongoing/);
 assert.deepEqual(report.rows[0].slice(6,8),['4.5','2.25']);
 assert.equal(report.rows[0].length,report.columns.length);
});
