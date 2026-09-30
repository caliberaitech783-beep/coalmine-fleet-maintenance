import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('OEM report banner places desktop filters beside branding and hides only its toolbar count', () => {
  const css = readFileSync(new URL('../src/oem-breakdown-details.css', import.meta.url), 'utf8');
  assert.match(css, /\.mine-oem-modal > header \.shared-table-record-count,\s*\.mine-oem-inline-details \.shared-table-record-count \{ display: none; \}/);
  assert.match(css, /@media screen and \(min-width: 1181px\)/);
  assert.match(css, /\.mine-oem-modal > \.dashboard-filter-bar\.in-dialog \{ display: grid; grid-template-columns: minmax\(230px, 280px\) minmax\(0, 1fr\)/);
  assert.match(css, /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\) auto auto auto/);
  assert.doesNotMatch(css, /min-width: 1600px/);
  assert.doesNotMatch(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});
