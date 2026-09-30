import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {activeTodayBreakdowns} from '../src/dashboard-today-breakdowns.mjs';
const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const day = '2026-09-30';
const row = (ref, status, extra = {}) => ({ref,status,start:day+' 09:00:00',...extra});
test('today badge excludes old, closed, verified, on-road and idle requests', () => {
  const rows = [row('open','Open'),row('accepted','Accepted'),row('old','Open',{start:'2026-09-29 09:00:00'}),
    ...['Closed','Verified','Idle','Ideal','On road','On-road','Completed'].map(status=>row(status,status)),
    row('completed','Accepted',{closedAt:day+' 10:00:00'}),row('idle','Closed',{vehicleIdle:true})];
  assert.deepEqual(activeTodayBreakdowns(rows,day).map(r=>r.ref),['open','accepted']);
});
test('new request increases the count and on-road completion removes it', () => {
  const rows = [row('new','Accepted')];
  assert.equal(activeTodayBreakdowns([],day).length,0);
  assert.equal(activeTodayBreakdowns(rows,day).length,1);
  rows[0] = {...rows[0],status:'Closed',closedAt:day+' 10:00:00'};
  assert.equal(activeTodayBreakdowns(rows,day).length,0);
});
test('IST midnight boundary and timestamp fallback', () => {
  const rows = [row('before','Open',{start:'2026-09-29T18:29:59Z'}),row('midnight','Open',{start:'2026-09-29T18:30:00Z'}),row('fallback','Open',{start:null,startedAt:day+' 11:00:00'})];
  assert.deepEqual(activeTodayBreakdowns(rows,day).map(r=>r.ref),['midnight','fallback']);
  assert.deepEqual(activeTodayBreakdowns(rows,''),[]);
});
test('badge and drilldown share the same active selection', () => {
  assert.ok(source.includes('const todayBreakdownRows = activeTodayBreakdowns(scopedBreakdowns, todayKey)'));
  assert.ok(source.includes('formatCountDelta(todayBreakdownRows.length)'));
  assert.ok(source.includes('day === todayKey ? todayBreakdownRows : activeTodayBreakdowns(scopedBreakdowns, day)'));
  assert.ok(source.includes('entered-today:${todayKey}'));
});
