import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {requestDateKey} from '../src/dashboard-request-data.mjs';
const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
test('trend badge opens today entries, including ones already closed, rather than net-change-sized list', () => {
  const body = source.slice(source.indexOf('    if (key.startsWith("entered-today:"))'), source.indexOf('    if (key.startsWith("balance:"))'));
  const rows = [{ref:'new',start:'2026-09-30 08:00:00',status:'Accepted'}, {ref:'closed',start:'2026-09-30 09:00:00',status:'Closed'}, {ref:'old',start:'2026-09-29 09:00:00'}];
  const select = new Function('key','scopedBreakdowns','requestDateKey','requestAssetRows',body);
  assert.deepEqual(select('entered-today:2026-09-30',rows,requestDateKey,rows=>rows).map(row=>row.ref),['new','closed']);
  assert.match(source,/aria-label="View vehicles that entered breakdown today"/);
  assert.match(source,/openAssetDrilldown\(`entered-today:\$\{breakdownCountChange.day \|\| todayKey\}`\)/);
});
