import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../src/vehicle-history-scroll.jsx', import.meta.url), 'utf8');
test('top scrollbar is scoped to Vehicle History and hidden from print', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  assert.match(main, /category === "vehicle-history" \? VehicleHistoryScroll : "div"/);
  assert.match(source, /hidden=\{!overflow\}/);
  assert.match(source, /aria-label="Scroll Vehicle History table horizontally"/);
  const css = readFileSync(new URL('../src/vehicle-history-scroll.css', import.meta.url), 'utf8');
  assert.match(css, /@media print.*display: none !important/s);
});
test('both scroll directions synchronize without redundant assignments', () => {
  const body = source.match(/const sync = \(source, target\) => \{([\s\S]*?)\n  \};/)[1];
  const sync = new Function('source', 'target', body);
  const table = {scrollLeft: 0}, top = {scrollLeft: 320};
  sync(top, table); assert.equal(table.scrollLeft, 320);
  table.scrollLeft = 85; sync(table, top); assert.equal(top.scrollLeft, 85);
  sync(top, null);
  assert.match(source, /resize.disconnect\(\); mutation.disconnect\(\)/);
  assert.match(source, /resize.observe\(table\)/);
});
