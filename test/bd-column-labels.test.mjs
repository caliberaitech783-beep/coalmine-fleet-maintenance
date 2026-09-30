import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isDurationColumn} from '../src/duration-sort.mjs';
import {orderOemDetailColumns} from '../src/oem-detail-columns.mjs';

test('drilldown headers use BD and retain duration and OEM adjacent-column behavior', () => {
  const source=readFileSync(new URL('../src/dashboard-record-browser.jsx',import.meta.url),'utf8');
  for (const label of ['Days of BD','Type of BD','Reason of BD','BD type','BD reason']) assert.ok(source.includes(`<th>${label}</th>`));
  assert.equal(isDurationColumn('Days of BD'),true);
  const columns=['BD reason','Opening HMR','Status','Daily remarks','Delayed reason'].map(label=>({label}));
  assert.deepEqual(orderOemDetailColumns(columns).map(c=>c.label),['BD reason','Delayed reason','Daily remarks','Status','Opening HMR']);
});
