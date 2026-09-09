import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const files=[
  'server.mjs',
  'consolidated-report-pdf.mjs',
  'consolidated-whatsapp-report.mjs',
  'ticket-consolidated-report.mjs',
  'director-report-email.mjs',
  'director-report-bundle.mjs',
  'table-export-pdf.mjs',
];

test('all user-facing server report formatters use the project date-time standard',async()=>{
  for(const file of files){
    const source=await readFile(new URL(`../${file}`,import.meta.url),'utf8');
    assert.match(source,/formatDisplayDateTime/,`${file} must use the shared date-time formatter`);
    assert.doesNotMatch(source,/month\s*:\s*['"](?:short|long)['"]/,`${file} must not display month-name dates`);
    assert.doesNotMatch(source,/timeStyle\s*:/,`${file} must not omit seconds through a timeStyle shortcut`);
  }
});

test('the application clock and user-facing timestamps use shared formatters',async()=>{
  const source=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.match(source,/const date = formatDisplayDate\(currentDateTime\)/);
  assert.match(source,/const time = formatDisplayTime\(currentDateTime\)/);
  assert.match(source,/function formatTwelveHourDateTime\(value\)/);
  assert.match(source,/formatDisplayDateTime\(value\)/);
  assert.doesNotMatch(source,/month\s*:\s*['"](?:short|long)['"]/);
  assert.doesNotMatch(source,/dateStyle\s*:/);
  assert.doesNotMatch(source,/timeStyle\s*:/);
});
