import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('OEM desktop banner keeps its filters beside the title without changing mobile or collapsed layout',()=>{
  const css=readFileSync(new URL('../src/dashboard-spacing.css',import.meta.url),'utf8');
  assert.match(css,/@media screen and \(min-width: 1181px\) and \(hover: hover\) and \(pointer: fine\)/);
  assert.match(css,/\.mine-dashboard\.mine-oem-view > \.dashboard-filter-bar:not\(\[data-collapsed="true"\]\)/);
  assert.match(css,/grid-template-columns: minmax\(230px, 300px\) minmax\(0, 1fr\)/);
  assert.match(css,/grid-template-columns: repeat\(6, minmax\(0, 1fr\)\) auto auto/);
});
