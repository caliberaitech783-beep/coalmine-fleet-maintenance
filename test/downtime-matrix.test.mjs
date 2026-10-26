import test from 'node:test';
import assert from 'node:assert/strict';
import {downtimeMatrix} from '../src/downtime-matrix.mjs';
import {downtimeMatrixRange,customBreakdownRange,downtimeMatrixDetails} from '../src/downtime-matrix.mjs';
test('custom report includes only openings in the selected overnight window',()=>{
  const records=[
    {ref:'old-open',door:'S1',site:'Sasti OC',start:'2026-10-24T21:59:59'},
    {ref:'old-closed',door:'S1',site:'Sasti OC',start:'2026-10-24T20:00',closedAt:'2026-10-24T23:00'},
    {ref:'at-start',door:'S1',site:'Sasti OC',start:'2026-10-24T22:00',closedAt:'2026-10-24T22:30'},
    {ref:'new-open',door:'S1',site:'Sasti OC',start:'2026-10-24T23:00'},
    {ref:'at-end',door:'S1',site:'Sasti OC',start:'2026-10-25T00:00'},
    {ref:'after',door:'S1',site:'Sasti OC',start:'2026-10-25T01:00'},
  ];
  const rows=customBreakdownRange(records,[],'2026-10-24T22:00','2026-10-25T00:00',Date.parse('2026-10-25T02:00+05:30'));
  const details=downtimeMatrixDetails(rows);
  assert.deepEqual(details.map(row=>row.ref),['at-start','new-open']);
  assert.deepEqual(details.map(row=>row.eventHours),[0.5,1]);
  assert.equal(rows[0].available,0.5);
  assert.deepEqual(customBreakdownRange(records.slice(0,2),[],'2026-10-24T22:00','2026-10-25T00:00',Date.parse('2026-10-25T02:00+05:30')),[]);
});
test('range counts overlapping events once and clips to custom multi-day period',()=>{
  const now=Date.parse('2026-10-15T00:00:00+05:30');
  const records=[
    {door:'EX01',site:'Mine',start:'2026-10-13T10:00',closedAt:'2026-10-14T12:00'},
    {door:'EX01',site:'Mine',start:'2026-10-14T10:00',closedAt:'2026-10-14T15:00'},
    {door:'EX02',site:'Mine',start:'2026-10-14T20:00',closedAt:'2026-10-14T21:00'},
  ];
  const [row]=downtimeMatrixRange(records,[],'2026-10-13T12:00','2026-10-14T18:00',now);
  assert.equal(row.downtime,27);assert.equal(row.available,3);assert.equal(row.events.length,2);
  assert.deepEqual(downtimeMatrixRange(records,[],'2026-10-14T18:00','2026-10-13T12:00',now),[]);
});
const now = Date.parse('2026-10-15T00:00:00+05:30');
const request = (start,closedAt,ref='BD1') => ({door:'EX01',site:'Mine',start,closedAt,ref});
test('two hour breakdown leaves 22 available hours',()=>{
  const [row] = downtimeMatrix([request('2026-10-14T10:00','2026-10-14T12:00')],[],'2026-10-14',now);
  assert.equal(row.downtime,2); assert.equal(row.available,22);
});
test('separate breakdowns keep individual durations',()=>{
  const [row] = downtimeMatrix([request('2026-10-14T10:00','2026-10-14T12:00'),request('2026-10-14T15:00','2026-10-14T16:00','BD2')],[],'2026-10-14',now);
  assert.deepEqual(row.events.map(e=>e.hours),[2,1]); assert.equal(row.available,21);
});
test('clips overnight events and unions overlaps',()=>{
  const [row] = downtimeMatrix([request('2026-10-13T23:00','2026-10-14T02:00'),request('2026-10-14T01:00','2026-10-14T03:00')],[],'2026-10-14',now);
  assert.equal(row.events.length,2); assert.equal(row.downtime,3); assert.equal(row.available,21);
});
test('excludes machines without breakdown and clips ongoing events at now',()=>{
  const rows = downtimeMatrix([request('2026-10-14T10:00',null)],[{door:'EX01',site:'Mine'},{door:'EX02',site:'Mine'}],'2026-10-14',Date.parse('2026-10-14T12:00:00+05:30'));
  assert.equal(rows.some(r=>r.door==='EX02'),false); assert.equal(rows.find(r=>r.door==='EX01').available,22);
});

test('matrix detail rows preserve separate timings, reasons and daily totals',async()=>{
  const {downtimeMatrixDetails} = await import('../src/downtime-matrix.mjs');
  const rows = downtimeMatrix([
    {...request('2026-10-14T10:00','2026-10-14T12:00'),equipmentGroup:'Excavator',complaint:'Hydraulics'},
    {...request('2026-10-14T15:00','2026-10-14T16:00','BD2'),equipmentGroup:'Excavator',complaint:'Engine'},
  ],[{door:'EX01',site:'Mine'},{door:'EX02',site:'Mine',group:'Dumper'}],'2026-10-14',now);
  const details = downtimeMatrixDetails(rows);
  assert.equal(details.length,2);
  const occurrences = details.filter(r=>r.door==='EX01');
  assert.deepEqual(occurrences.map(r=>r.reason),['Hydraulics','Engine']);
  assert.deepEqual(occurrences.map(r=>r.eventHours),[2,1]);
  assert.deepEqual(occurrences.map(r=>r.available),[21,21]);
  assert.deepEqual(occurrences.map(r=>r.equipmentGroup),['EXCAVATOR','EXCAVATOR']);
  assert.equal(details.some(r=>r.door==='EX02'),false);
});

test('excludes vehicles whose breakdown ended before the selected day',()=>{
  const rows = downtimeMatrix([request('2026-10-13T10:00','2026-10-14T00:00')],[{door:'EX01',site:'Mine'}],'2026-10-14',now);
  assert.deepEqual(rows,[]);
});

test('detail status distinguishes ongoing and closed breakdowns', async()=>{
  const {downtimeMatrixDetails,downtimeHoursMinutes} = await import('../src/downtime-matrix.mjs');
  const rows = downtimeMatrix([request('2026-10-14T10:00','2026-10-14T12:00'), request('2026-10-14T15:00',null,'BD2')],[],'2026-10-14',now);
  assert.deepEqual(downtimeMatrixDetails(rows).map(r=>r.status),['Closed','Ongoing']);
  assert.equal(downtimeHoursMinutes(2.5),'02h 30m');
  assert.equal(downtimeHoursMinutes(0),'00h 00m');
  assert.equal(downtimeHoursMinutes(24),'24h 00m');
  assert.equal(downtimeHoursMinutes(119.6/60),'02h 00m');
});

test('downtime report dates resolve site shifts for daytime and midnight carryover', async()=>{
  const {downtimeMatrixDetails} = await import('../src/downtime-matrix.mjs');
  const {requestShiftColumns} = await import('../request-shift.mjs');
  const {SHIFT_MASTER_DEFAULTS} = await import('../shift-master.mjs');
  const records = [
    {...request('2026-10-14T12:00','2026-10-14T13:00'),site:'Jayant OC'},
    {...request('2026-10-13T23:00','2026-10-14T02:00','BD2'),site:'Sasti OC'},
  ];
  const details = downtimeMatrixDetails(downtimeMatrix(records,[],'2026-10-14',now));
  const shift = requestShiftColumns([],details,SHIFT_MASTER_DEFAULTS)[0];
  assert.equal(shift.value(details.find(row=>row.site==='Jayant OC')),'Shift B');
  assert.equal(shift.value(details.find(row=>row.site==='Sasti OC')),'Shift C');
  assert.equal(typeof details[0].start,'string');
  assert.equal(typeof details[0].end,'string');
});
