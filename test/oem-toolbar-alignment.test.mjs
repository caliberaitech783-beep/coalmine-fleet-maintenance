import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('OEM report switching is centered while table actions align right', () => {
  const css = readFileSync(new URL('../src/oem-breakdown-details.css', import.meta.url), 'utf8');
  assert.match(css, /:is\(\.mine-oem-view-toolbar, \.mine-oem-top-toolbar\) \.shared-table-actions-toolbar \{ justify-content: flex-end; \}/);
  assert.match(css, /left: 50%; transform: translateX\(-50%\)/);
  assert.match(css, /@media \(min-width: 1400px\)/);
});
