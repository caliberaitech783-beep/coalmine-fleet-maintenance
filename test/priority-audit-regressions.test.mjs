import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateClosingMeterReadings} from '../request-workflow.mjs';
import {requestsVisibleToMisWorkspace} from '../mis-request-visibility.mjs';
import {visibleInMisRequests} from '../src/mis-history.mjs';
import {requestEventDate} from '../src/dashboard-request-data.mjs';
const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('closing counters cannot decrease or conflict with their named field', () => {
  const before = {meterType:'KMR',openingMeterReadings:{HMR:'14834',KMR:'243679'}};
  assert.throws(() => validateClosingMeterReadings(before,{closingMeterReadings:{HMR:'243679',KMR:'14835'}}), /Closing KMR cannot be lower/);
  assert.doesNotThrow(() => validateClosingMeterReadings(before,{closingMeterReadings:{HMR:'14835',KMR:'243679'},closingMeterReading:'243679'}));
  assert.throws(() => validateClosingMeterReadings(before,{closingMeterReadings:{KMR:'243679'},closingMeterReading:'14835'}), /Conflicting closing KMR/);
  assert.throws(() => validateClosingMeterReadings({meterType:'HMR',openingMeterReading:'10'},{closingMeterReading:'0'}), /Closing HMR/);
  assert.doesNotThrow(() => validateClosingMeterReadings({meterType:'HMR',openingMeterReading:'0'},{closingMeterReading:'0'}));
  assert.doesNotThrow(() => validateClosingMeterReadings({},{}));
  assert.deepEqual(before.openingMeterReadings,{HMR:'14834',KMR:'243679'});
});

test('meter type and both named counters are loaded inside the locked transaction', () => {
  const server = readFileSync(new URL('../server.mjs', import.meta.url),'utf8');
  const projection = server.match(/const requestTimelineProjection=`([^`]+)`/)[1];
  for (const field of ['meterType','openingMeterReadings','closingMeterReadings']) assert.ok(projection.includes(`AS "${field}"`));
  assert.equal((server.match(/validateClosingMeterReadings\(before,/g)||[]).length,2);
});

test('historical MIS exclusions cannot hide pending closed work', () => {
  const pending = {ref:'REQ-1787759984730',status:'Closed',verifiedAt:null};
  assert.deepEqual(requestsVisibleToMisWorkspace([pending],true).filter(visibleInMisRequests),[pending]);
  assert.deepEqual(requestsVisibleToMisWorkspace([{...pending,verifiedAt:'2026-09-29 12:00:00'}],true),[]);
});

test('report keys are unique even for assets sharing location or duplicate identifiers', () => {
  const expression = main.match(/rowKey=\{selectedReport.rowKey \|\| \(\(row, index\) => (.+)\)\}/)[1];
  const key = new Function('row','index','selectedReport',`return ${expression}`);
  const rows = [{location:'Majri',id:1},{location:'Majri',id:2},{location:'Majri',id:2}];
  assert.equal(new Set(rows.map((r,i)=>key(r,i,{title:'Availability Report'}))).size,3);
  assert.doesNotMatch(expression,/row\.location/);
});

test('Closed summary and daily chart use identical scoped rows, including verified closures', () => {
  const code = main.slice(main.indexOf('  const requestLifecycleRows ='),main.indexOf('  // Keep all six compact series'));
  const calculate = new Function('locationBreakdowns','requestEventDate','safeTrendStartKey','requestTrendEndKey','requestTrendDateKeys','requestLifecycleRegion','requestLifecycleSite','isIdleVehicleRequest',`${code}; return {requestLifecycleRows,requestLifecycleTrend};`);
  const rows = [
    {ref:'closed',status:'Closed',closedAt:'2026-09-24 10:00:00'},
    {ref:'verified',status:'Closed',closedAt:'2026-09-24 11:00:00',verifiedAt:'2026-09-25 12:00:00'},
    {ref:'outside',status:'Closed',closedAt:'2026-09-23 11:00:00'},
    {ref:'active',status:'Accepted'},
  ];
  const result=calculate(rows,requestEventDate,'2026-09-24','2026-09-24',['2026-09-24'],null,null,()=>false);
  assert.equal(result.requestLifecycleRows.closed.length,2);
  assert.equal(result.requestLifecycleTrend[0].closed,2);
  assert.match(main,/key: "closed", label: "Closed"[^\n]+value: requestLifecycleRows.closed.length/);
  assert.match(main,/const rows = requestLifecycleRows\[event\] \|\| \[\];/);
});
