import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('mobile region tabs occupy a separate full-width row and never shrink into their labels',()=>{
  const css=readFileSync(new URL('../src/dashboard-record-browser.css',import.meta.url),'utf8').split('@media (max-width: 560px)')[1];
  assert.match(css,/\.dashboard-record-tabs \{ flex: 0 0 100%; width: 100%/);
  assert.match(css,/button \{ flex: 1 0 auto; min-width: max-content/);
  assert.match(css,/white-space: nowrap/);
  assert.match(css,/button b \{ flex-shrink: 0/);
});
