import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

test('hourly report fills its page without changing other page gutters', () => {
  const css = readFileSync(new URL('../src/hourly-breakdown-view.css', import.meta.url), 'utf8');
  assert.match(css, /\.body:has\(\.hourly-breakdown-view\), \.normal > main:has\(\.hourly-breakdown-view\) \{ max-width: none; width: 100%; padding: 0;/);
  assert.match(css, /width: 100%; margin: 0; box-sizing: border-box; overflow: hidden; gap: 0; padding: 0;/);
  assert.match(css, /grid-template-rows: auto minmax\(0, 1fr\)/);
  assert.match(css, /thead th \{ position: sticky; top: 0;/);
});
