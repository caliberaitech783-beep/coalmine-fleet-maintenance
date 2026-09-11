import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('mobile fleet toggle contains its count and live trend without hiding controls',()=>{
  const source=readFileSync(new URL('../src/dashboard-readability.css',import.meta.url),'utf8');
  const css=source.slice(source.indexOf('/* Keep the live Breakdown'));
  assert.match(css,/@media \(max-width: 700px\)/);
  assert.match(css,/grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1.35fr\)/);
  assert.match(css,/flex-wrap: wrap/);
  assert.match(css,/min-width: 0/);
  assert.doesNotMatch(css,/display: none|overflow: hidden|pointer-events: none/);
});
