import test from 'node:test';
import assert from 'node:assert/strict';
import {formatDisplayDate,formatDisplayDateRange,formatDisplayDateTime,formatDisplayTime,formatTimeInputValue,parseTwelveHourTime} from '../date-time-format.mjs';

test('formats project dates as DD-MM-YYYY',()=>{
  assert.equal(formatDisplayDate('2026-09-07'),'07-09-2026');
  assert.equal(formatDisplayDateRange('2026-09-02','2026-09-06'),'02-09-2026 to 06-09-2026');
});

test('formats local project timestamps in 12-hour time with seconds',()=>{
  assert.equal(formatDisplayDateTime('2026-09-07'),'07-09-2026 12:00:00 AM');
  assert.equal(formatDisplayDateTime('2026-09-07 00:05'),'07-09-2026 12:05:00 AM');
  assert.equal(formatDisplayDateTime('2026-09-07 13:04:09'),'07-09-2026 01:04:09 PM');
  assert.equal(formatDisplayDateTime('2026-09-07 · 17:25:37'),'07-09-2026 05:25:37 PM');
  assert.equal(formatDisplayTime('2026-09-07 13:04:09'),'01:04:09 PM');
  assert.equal(formatDisplayTime('17:25:37'),'05:25:37 PM');
});

test('converts zoned timestamps to India time before display',()=>{
  assert.equal(formatDisplayDateTime('2026-09-07T12:00:00Z'),'07-09-2026 05:30:00 PM');
});

test('preserves non-date text and uses the project empty value',()=>{
  assert.equal(formatDisplayDateTime('Pending'),'Pending');
  assert.equal(formatDisplayDateTime(''),'—');
});

test('12-hour form values round-trip to the existing machine format',()=>{
  assert.equal(formatTimeInputValue('19:05'), '07:05 PM');
  assert.equal(formatTimeInputValue('19:05:09',{includeSeconds:true}), '07:05:09 PM');
  assert.equal(parseTwelveHourTime('12:00 AM'), '00:00');
  assert.equal(parseTwelveHourTime('7:05 PM'), '19:05');
  assert.equal(parseTwelveHourTime('7:05:09 PM',{includeSeconds:true}), '19:05:09');
  assert.equal(parseTwelveHourTime('19:05'), '');
});
