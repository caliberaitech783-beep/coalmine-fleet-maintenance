import test from 'node:test';
import assert from 'node:assert/strict';
import {formatDisplayDate,formatDisplayDateRange,formatDisplayDateTime,formatDisplayTime} from '../date-time-format.mjs';

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
