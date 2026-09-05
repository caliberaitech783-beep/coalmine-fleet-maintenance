import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('maintenance table controls collapse by default with an accessible toggle', () => {
  const source = readFileSync(new URL('../src/main.jsx', import.meta.url),'utf8');
  assert.match(source, /\[mobileControlsOpen, setMobileControlsOpen\] = useState\(false\)/);
  assert.match(source, /aria-expanded=\{mobileControlsOpen\} aria-controls=\{mobileControlsId\}/);
  assert.match(source, /id=\{mobileControlsId\} data-mobile-open=\{mobileControlsOpen\}/);
});

test('compact layout and hiding are limited to mobile maintenance workspaces', () => {
  const css = readFileSync(new URL('../src/maintenance-mobile-compact.css', import.meta.url),'utf8');
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /\.maintenance-workspace \.table-search-toolbar\[data-mobile-open="false"\] \{ display: none !important;/);
  assert.match(css, /\.maintenance-table-menu \{ display: none;/);
  assert.match(css, /\.maintenance-workspace \.workspace-hero h1/);
});
