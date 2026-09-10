import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('all generated reports keep real headers sticky inside their bounded two-axis viewport',()=>{
  const css=readFileSync(new URL('../src/reports-workspace.css',import.meta.url),'utf8');
  const rules=css.slice(css.indexOf('/* Keep each report'));
  assert.match(rules,/@media screen/);
  assert.match(rules,/\.reports-detail-table\s*\{[^}]*max-height:[^}]*overflow: auto/s);
  assert.match(rules,/thead th\s*\{[^}]*position: sticky;[^}]*top: 0;[^}]*z-index: 6;[^}]*background:/s);
  assert.match(rules,/data-theme="dark"/);
  const jsx=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.match(jsx,/className="reports-detail-table emptytable"/);
  assert.match(jsx,/<table className="report-filter-table">/);
});
