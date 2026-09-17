import test from 'node:test';
import assert from 'node:assert/strict';
import { groupReportRows, siteReportHtml, reportCount } from '../src/site-report.mjs';

const rows = [
  { site: 'NCL · Jayant', asset: 'j1', value: 'J1' },
  { site: 'WCL · Sasti', asset: 's1', value: 'S1' },
  { site: 'NCL · Jayant', asset: 'j1', value: 'J2' },
];
const grouping = { site: row => row.site, asset: row => row.asset };
test('site grouping keeps canonical site order and the selected order within each site', () => {
  const groups = groupReportRows(rows, grouping.site, grouping.asset, ['WCL · Sasti', 'NCL · Jayant']);
  assert.deepEqual(groups.map(group => [group.label, group.assets, group.rows.map(row => row.value)]), [
    ['WCL · Sasti', 1, ['S1']], ['NCL · Jayant', 1, ['J1', 'J2']],
  ]);
  const filtered = groupReportRows(rows.filter(row => row.value !== 'S1'), grouping.site, grouping.asset);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].rows.length, 2);
  assert.equal(filtered[0].assets, 1);
  assert.deepEqual(groupReportRows([], grouping.site, grouping.asset), []);
});

test('print preserves site headings when the site column is unselected and escapes text', () => {
  const selected = [{ site: '<site>', asset: 'one', value: '<script>' }];
  const html = siteReportHtml({ rows: selected, columns: [{ label: 'Machine' }], cells: [['<script>']], grouping,
    escape: text => String(text).replaceAll('<', '&lt;').replaceAll('>', '&gt;') });
  assert.ok(html.includes('&lt;site&gt;'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.match(html, /class="site-print-title"/);
  assert.ok(html.includes('<th>Machine</th>'));
  assert.ok(html.includes('<b>Total: 1 asset</b>'));
});

test('equal counts are stated once and print summary is a single text paragraph', () => {
  assert.equal(reportCount(25,25), '25 assets');
  assert.equal(reportCount(1,1), '1 asset');
  assert.equal(reportCount(1,2), '1 asset · 2 records');
  const html=siteReportHtml({rows,columns:[{label:'Machine'}],cells:rows.map(row=>[row.value]),grouping,escape:String});
  assert.match(html, /<p class="site-print-summary">/);
  assert.doesNotMatch(html, /<table class="site-print-summary">/);
  assert.ok(html.includes('WCL · Sasti: 1 asset'));
});
