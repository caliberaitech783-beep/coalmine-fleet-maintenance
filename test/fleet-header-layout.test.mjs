import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/fleet-header-layout.css',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
test('all fleet modes share equal cards and explicit header positions',()=>{
  assert.match(css,/repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css,/min-height: 54px/);
  assert.match(css,/grid-column: 2;\s*grid-row: 1/);
  assert.doesNotMatch(css,/data-mode|mine-oem-tab|\.active/);
  assert.ok(main.indexOf('import "./fleet-header-layout.css"')>main.indexOf('import "./mobile-phone-optimization.css"'));
});
test('compact screens center the shared strip and preserve three mobile cards',()=>{
  assert.match(css,/@media \(max-width: 1500px\)/);
  assert.match(css,/grid-column: 1 \/ -1; grid-row: 2; max-width: 660px/);
  assert.match(css,/\.mine-fleet-view-option:last-child \{ grid-column: auto; \}/);
});
