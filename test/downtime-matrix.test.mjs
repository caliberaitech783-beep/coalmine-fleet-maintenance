import test from 'node:test';
import assert from 'node:assert/strict';
import {downtimeMatrix} from '../src/downtime-matrix.mjs';
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
  const rows = downtimeMatrix([request('2026-10-14T10:00',null)],[{door:'EX02',site:'Mine'}],'2026-10-14',Date.parse('2026-10-14T12:00:00+05:30'));
  assert.equal(rows.some(r=>r.door==='EX02'),false); assert.equal(rows.find(r=>r.door==='EX01').available,22);
});

test('matrix detail rows preserve separate timings, reasons and daily totals',async()=>{
  const {downtimeMatrixDetails} = await import('../src/downtime-matrix.mjs');
  const rows = downtimeMatrix([
    {...request('2026-10-14T10:00','2026-10-14T12:00'),equipmentGroup:'Excavator',complaint:'Hydraulics'},
    {...request('2026-10-14T15:00','2026-10-14T16:00','BD2'),equipmentGroup:'Excavator',complaint:'Engine'},
  ],[{door:'EX02',site:'Mine',group:'Dumper'}],'2026-10-14',now);
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
