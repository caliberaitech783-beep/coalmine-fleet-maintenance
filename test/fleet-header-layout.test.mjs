import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/mobile-phone-optimization.css',import.meta.url),'utf8').split('/* One header geometry')[1];
const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
test('all fleet modes share equal cards and explicit header positions',()=>{
  assert.match(css,/repeat\(4, minmax\(max-content, 1fr\)\)/);
  assert.match(css,/min-height: 54px/);
  assert.match(css,/grid-column: 2;\s*grid-row: 1/);
  assert.doesNotMatch(css,/data-mode|mine-oem-tab|\.active/);
  assert.ok(main.indexOf('import "./mobile-phone-optimization.css"')>main.indexOf('import "./dashboard-spacing.css"'));
});
test('compact screens center the shared strip and preserve three mobile cards',()=>{
  assert.match(css,/@media \(max-width: 1500px\)/);
  assert.match(css,/grid-column: 1 \/ -1; grid-row: 2; max-width: 660px/);
  assert.match(css,/\.mine-fleet-view-option:last-child \{ grid-column: auto; \}/);
});
