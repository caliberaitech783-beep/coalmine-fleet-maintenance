import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('OEM touch layout uses one vertical scroller without clipping table rows',()=>{
  const css=readFileSync(new URL('../src/oem-breakdown-details.css',import.meta.url),'utf8');
  assert.match(css,/@media \(max-width: 700px\), \(hover: none\) and \(pointer: coarse\)/);
  assert.match(css,/:is\(\.mine-oem-modal, \.mine-oem-inline-details\) \.mine-oem-details\s*\{\s*display: block; overflow-x: hidden; overflow-y: auto/);
  assert.match(css,/\.mine-oem-details \.mine-oem-site-tables \.dashboard-record-results\s*\{\s*display: block; flex: none; height: auto; min-height: 0; max-height: none; overflow: visible/);
  assert.match(css,/touch-action: pan-x pan-y/);
});

test('OEM hide/show filter control remains visible in both report groupings',()=>{
  const css=readFileSync(new URL('../src/oem-breakdown-details.css',import.meta.url),'utf8');
  const component=readFileSync(new URL('../src/oem-breakdown-details.jsx',import.meta.url),'utf8');
  assert.doesNotMatch(css,/\.mine-oem-report-navigation \+ \.mine-oem-detail-context\s*\{\s*display:\s*none/);
  assert.doesNotMatch(css,/:is\(\.mine-oem-selection, \.mine-oem-context-end\)[^{]*\{\s*display:\s*none/);
  assert.match(css,/\.mine-oem-details \.mine-oem-context-end\s*\{\s*display: flex/);
  assert.match(component,/onClick=\{\(\) => setFiltersHidden\(hidden => !hidden\)\}/);
  assert.match(component,/filtersHidden \? "Show filters" : "Hide filters"/);
  assert.match(css,/\.mine-oem-details\.filters-hidden :is\(\.mine-oem-detail-search, \.dashboard-fleet-search, \.site-report-summary\)/);
});

test('OEM report banner places desktop filters beside branding and hides only its toolbar count', () => {
  const css = readFileSync(new URL('../src/oem-breakdown-details.css', import.meta.url), 'utf8');
  assert.match(css, /\.mine-oem-modal > header \.shared-table-record-count,\s*\.mine-oem-inline-details \.shared-table-record-count \{ display: none; \}/);
  assert.match(css, /@media screen and \(min-width: 1181px\)/);
  assert.match(css, /\.mine-oem-modal > \.dashboard-filter-bar\.in-dialog \{ display: grid; grid-template-columns: minmax\(230px, 280px\) minmax\(0, 1fr\)/);
  assert.match(css, /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\) auto auto auto/);
  assert.doesNotMatch(css, /min-width: 1600px/);
  assert.doesNotMatch(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});
