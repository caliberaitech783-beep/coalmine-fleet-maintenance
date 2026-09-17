import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('availability summary cards are compact and the redundant date note stays removed', () => {
  const css = readFileSync(new URL('../src/dashboard-readability.css', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  assert.match(css, /\.mine-dashboard \.mine-site-road-summary > button\s*\{[^}]*min-height: 60px;[^}]*padding: 6px 10px;/);
  assert.match(css, /\.mine-dashboard \.mine-site-road-gauge\s*\{[^}]*width: 48px; height: 48px;/);
  assert.doesNotMatch(source, /BD movement includes both dates/);
  for (const key of ['road-availability', 'onroad', 'offroad', 'idle']) {
    assert.ok(source.includes(`openAssetDrilldown("${key}")`));
  }
});
