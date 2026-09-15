import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformWithOxc} from 'vite';

const source = readFileSync(new URL('../src/maintenance-etc-input.jsx', import.meta.url), 'utf8');
const compiled = await transformWithOxc(source.replace(/^import .*;$/gm, '').replace(/export default /g, '').replace(/export /g, ''), 'maintenance-etc-input.jsx', {jsx:{runtime:'classic'}});
const {etcParts, etcValue, etcMinimum, etcMinimumLabel, isEtcBackdated, etcPeriodDisabled, etcHourDisabled, etcMinuteDisabled} = new Function(`${compiled.code};return {etcParts,etcValue,etcMinimum,etcMinimumLabel,isEtcBackdated,etcPeriodDisabled,etcHourDisabled,etcMinuteDisabled};`)();
const MaintenanceEtcInput = new Function('React', 'useState', `${compiled.code};return MaintenanceEtcInput;`)(React, React.useState);

test('ETC 12-hour display preserves every stored hour and minute', () => {
  for (let hour=0;hour<24;hour++) for (const minute of ['00','30','59']) {
    const value=`2026-11-10T${String(hour).padStart(2,'0')}:${minute}`;
    assert.equal(etcValue(etcParts(value)), value);
  }
  assert.deepEqual(etcParts('2026-11-10T14:56'), {date:'2026-11-10',hour:'02',minute:'56',period:'PM'});
  assert.equal(etcParts('2026-11-10T00:00').period, 'AM');
  assert.equal(etcParts('2026-11-10T12:00').period, 'PM');
});
test('ETC remains required and submits the existing field name without incomplete times', () => {
  assert.equal(etcValue(etcParts('')), '');
  for (const key of ['date','hour','minute','period']) assert.equal(etcValue({...etcParts('2026-11-10T14:56'),[key]:''}), '');
  assert.match(source, /type="hidden" name="expectedCompletionAt"/);
  assert.equal((source.match(/<input type="date" required|<select required/g)||[]).length, 4);
  const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.match(main, /<MaintenanceEtcInput value=\{expectedCompletionAt\} onChange=\{setExpectedCompletionAt\}/);
  assert.match(main, /expectedCompletionAt: form.get\("expectedCompletionAt"\)/);
});

test('past ETC dates, periods, hours and minutes are closed using the current IST minute', () => {
  const minimum = etcMinimum(new Date('2026-09-15T10:52:31Z')); // 16:22:31 IST
  assert.equal(minimum, '2026-09-15T16:23');
  assert.equal(etcMinimumLabel(minimum), '15-09-2026 04:23 PM IST');
  assert.equal(etcMinimum(new Date('2026-09-15T18:29:59Z')), '2026-09-16T00:00');
  assert.equal(isEtcBackdated('2026-09-15T16:22', minimum), true);
  assert.equal(isEtcBackdated('2026-09-15T16:23', minimum), false);
  assert.equal(etcPeriodDisabled('2026-09-15', 'AM', minimum), true);
  assert.equal(etcPeriodDisabled('2026-09-15', 'PM', minimum), false);
  assert.equal(etcHourDisabled({date: '2026-09-15', period: 'PM'}, '03', minimum), true);
  assert.equal(etcHourDisabled({date: '2026-09-15', period: 'PM'}, '04', minimum), false);
  const fourPm = {date: '2026-09-15', period: 'PM', hour: '04', minute: ''};
  assert.equal(etcMinuteDisabled(fourPm, '22', minimum), true);
  assert.equal(etcMinuteDisabled(fourPm, '23', minimum), false);
  assert.equal(etcPeriodDisabled('2026-09-16', 'AM', minimum), false);
  assert.match(source, /min=\{minimum\.slice\(0, 10\)\}/);
  assert.match(source, /Change to a future ETC/);
});

test('elapsed existing ETC stays auditable and locked until replacement is chosen', () => {
  const now = new Date('2026-09-15T10:52:31Z');
  const locked = renderToStaticMarkup(React.createElement(MaintenanceEtcInput, {value: '2026-09-15T15:00', onChange() {}, now}));
  assert.match(locked, /name="expectedCompletionAt" value="2026-09-15T15:00"/);
  assert.match(locked, /<button type="button" class="etc-replace-button">Change to a future ETC<\/button>/);
  assert.match(locked, /<input type="date"[^>]*disabled=""/);
  const fresh = renderToStaticMarkup(React.createElement(MaintenanceEtcInput, {value: '', onChange() {}, now}));
  assert.match(fresh, /min="2026-09-15"/);
  assert.match(fresh, /Earliest allowed: 15-09-2026 04:23 PM IST/);
  assert.doesNotMatch(fresh, /Change to a future ETC/);
  assert.match(source, /disabled=\{etcPeriodDisabled\(parts\.date, period, minimum\)\}/);
});
