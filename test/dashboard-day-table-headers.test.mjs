import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

test('day-wise BD movement headers use a larger readable font without changing body cells',()=>{
  const css=readFileSync(new URL('../src/dashboard-concept-a.css',import.meta.url),'utf8');
  assert.match(css,/\.dashboard-breakdown-movement-modal \.dashboard-breakdown-day-table th \{[^}]*font-size: 14px !important;[^}]*font-weight: 700;/);
  assert.match(css,/\.dashboard-breakdown-day-table th \{[^}]*position: sticky;/);
});
