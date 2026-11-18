import test from 'node:test';
import assert from 'node:assert/strict';
import {shiftWindowForDate,timestampMatchesShiftWindow} from '../shift-report-time.mjs';

const shifts = [
  {site:'Sasti OC',shiftName:'Shift A',shiftCode:'A',startTime:'05:00:00',endTime:'13:00:00',status:'Active'},
  {site:'Sasti OC',shiftName:'Shift B',shiftCode:'B',startTime:'13:00:00',endTime:'21:00:00',status:'Active'},
  {site:'Sasti OC',shiftName:'Shift C',shiftCode:'C',startTime:'21:00:00',endTime:'05:00:00',status:'Active'},
];
const matches = (value, shift, now, date='2026-11-18') => timestampMatchesShiftWindow(value,{site:'Sasti OC',shifts,shift,from:date,to:date,now});

test('today future shift has no records before it starts',()=>{
  assert.equal(matches('2026-11-17T21:30:00','C','2026-11-18T13:24:00'),false);
  assert.equal(matches('2026-11-18T21:00:00','C','2026-11-18T13:24:00'),false);
});

test('running shift includes only its elapsed interval',()=>{
  assert.equal(matches('2026-11-18T13:00:00','B','2026-11-18T15:00:00'),true);
  assert.equal(matches('2026-11-18T14:59:59','B','2026-11-18T15:00:00'),true);
  assert.equal(matches('2026-11-18T15:00:01','B','2026-11-18T15:00:00'),false);
  assert.equal(matches('2026-11-17T14:00:00','B','2026-11-18T15:00:00'),false);
});

test('completed and past shifts use the selected business date only',()=>{
  assert.equal(matches('2026-11-18T06:00:00','A','2026-11-18T15:00:00'),true);
  assert.equal(matches('2026-11-18T13:00:00','A','2026-11-18T15:00:00'),false);
  assert.equal(matches('2026-11-17T06:00:00','A','2026-11-18T15:00:00'),false);
  assert.equal(matches('2026-11-17T06:00:00','A','2026-11-18T15:00:00','2026-11-17'),true);
});

test('overnight activity after midnight belongs to the starting business date',()=>{
  assert.equal(matches('2026-11-19T01:00:00','C','2026-11-19T02:00:00'),true);
  assert.equal(matches('2026-11-19T05:00:00','C','2026-11-19T06:00:00'),false);
  const window=shiftWindowForDate('2026-11-18',{site:'Sasti OC',shifts,shift:'C'});
  assert.ok(window);
  assert.equal(window.end-window.start,8*60*60*1000);
});

test('missing site shift definitions and invalid ranges fail closed',()=>{
  assert.equal(timestampMatchesShiftWindow('2026-11-18T06:00:00',{site:'Unknown',shifts,shift:'A',from:'2026-11-18',to:'2026-11-18',now:'2026-11-18T15:00:00'}),false);
  assert.equal(timestampMatchesShiftWindow('2026-11-18T06:00:00',{site:'Sasti OC',shifts,shift:'A',from:'2026-11-19',to:'2026-11-18',now:'2026-11-18T15:00:00'}),false);
});
