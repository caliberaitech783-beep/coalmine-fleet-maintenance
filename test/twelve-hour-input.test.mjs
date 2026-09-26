import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const source=readFileSync(new URL('../src/twelve-hour-input.jsx',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const whatsApp=readFileSync(new URL('../src/whatsapp-report-settings.jsx',import.meta.url),'utf8');
const corrections=readFileSync(new URL('../src/request-corrections.jsx',import.meta.url),'utf8');

test('shared time controls display AM/PM and submit machine-compatible hidden values',()=>{
  assert.match(source,/formatTimeInputValue/);
  assert.match(source,/parseTwelveHourTime/);
  assert.match(source,/type="hidden" name=\{name\} value=\{machineValue/);
  assert.match(source,/placeholder=\{includeSeconds \? '07:00:00 PM' : '07:00 PM'\}/);
});

test('all editable time-of-day surfaces use shared 12-hour controls',()=>{
  assert.doesNotMatch(main,/type="time"|datetime-local|TIME_24H_PATTERN/);
  assert.doesNotMatch(whatsApp,/type="time"/);
  assert.doesNotMatch(corrections,/datetime-local/);
  assert.match(main,/TwelveHourTimeInput name="firstTripTime" includeSeconds required/g);
  assert.match(main,/TwelveHourDateTimeInput value=\{reportZipFrom\}/);
  assert.match(whatsApp,/TwelveHourTimeInput/);
  assert.match(corrections,/TwelveHourDateTimeInput/);
});
