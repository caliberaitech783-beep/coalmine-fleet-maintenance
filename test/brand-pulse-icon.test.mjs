import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const css=readFileSync(new URL('../src/brand-theme.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const mail=readFileSync(new URL('../audit-log-export.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');

test('the brand shows the shared pulse icon in front of Nerve Center everywhere the brand component is used',()=>{
  assert.match(source,/<span className="caliber-app-name">\s*<strong><PulseIcon className="caliber-pulse-icon" \/>Nerve Center<\/strong>/);
  assert.ok((source.match(/<CaliberBrand/g)||[]).length>=6,'headers and the login page all render the brand component');
  assert.match(css,/\.caliber-app-name strong \{ display: inline-flex; align-items: center; gap: 6px; \}/);
  assert.match(css,/\.caliber-pulse-icon \{ flex: 0 0 auto; width: 1\.15em; height: 1\.15em; color: #ffd6e6; \}/);
  assert.doesNotMatch(css,/caliber-pulse-trace|stroke-dasharray: 26 64/,'the old right-to-left trace is gone');
});

test('the Audit Trail e-mail header carries the pulse glyph before the name',()=>{
  assert.match(mail,/<svg width="14" height="14" viewBox="0 0 24 24"[^>]*><path d="M22 12h-2\.48/);
  assert.match(mail,/<\/svg>NERVE CENTER<\/p>/);
});
