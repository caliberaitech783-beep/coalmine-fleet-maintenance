import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('mobile fleet chart reserves label space separately from region totals',()=>{
  const css=readFileSync(new URL('../src/dashboard-readability.css',import.meta.url),'utf8');
  const mobile=css.slice(css.indexOf('/* Mobile site details'));
  assert.match(mobile,/@media \(max-width: 700px\)/);
  assert.match(mobile,/height: 390px; min-height: 390px/);
  assert.match(mobile,/grid-template-rows: minmax\(0, 1fr\) 180px/);
  assert.match(mobile,/bottom: 244px/); // 180px labels + 46px footer + 18px bar padding
  assert.match(mobile,/white-space: normal/);
  assert.match(mobile,/font-size: 13px/);
  assert.doesNotMatch(mobile,/display: none|pointer-events: none/);
});
