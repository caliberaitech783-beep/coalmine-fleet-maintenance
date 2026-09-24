import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const jsx=readFileSync(new URL('../src/dashboard-record-browser.jsx',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const css=readFileSync(new URL('../src/dashboard-record-browser.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const oemJsx=readFileSync(new URL('../src/oem-breakdown-details.jsx',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const oemCss=readFileSync(new URL('../src/oem-breakdown-details.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');

test('Search fleet sits in the records bar on the right and Site chips sit beside the Region chips',()=>{
  assert.match(jsx,/style=\{\{ gridTemplateRows: hideHierarchyFilters \? "minmax\(0, 1fr\)" : "auto minmax\(0, 1fr\)" \}\}>\s*\{!hideHierarchyFilters && <details/,'no separate search row above the filters');
  assert.match(jsx,/<div className="dashboard-record-toolbar-row">\s*<div className="dashboard-record-toolbar" ref=\{setToolbarTarget\} \/>\s*\{!hideFleetSearch && <label className="dashboard-fleet-search"><span className="dashboard-fleet-search-label">Search fleet<\/span><input autoFocus data-smart-search type="search" aria-label="Search fleet"/,'search after the table actions in the same row');
  assert.equal((jsx.match(/className="dashboard-fleet-search"/g)||[]).length,1);
  assert.match(jsx,/<\/div>\s*\{visibleLevel >= 1 && Array\.isArray\(view\.options\.site\) && <FilterTabRow key=\{`site-\$\{view\.selection\.region\}`\} name="site" label="Site" allLabel="All sites" options=\{view\.options\.site\} value=\{view\.selection\.site\} choose=\{choose\} resultsId=\{`\$\{id\}-records`\} \/>\}\s*<button type="button" className="dashboard-record-reset"/,'site row on the top line before Reset');
  assert.match(jsx,/fields\.slice\(0, visibleLevel\)\.map\(\(\[name, label, allLabel\], index\) => index >= 1 && view\.options\[fields\[index - 1\]\[0\]\]\.length > 0 && <FilterTabRow/,'deeper levels keep their own rows');
  assert.match(css,/\.dashboard-record-topline::before \{ content: "Region";/);
  assert.match(css,/\.dashboard-record-topline > \.dashboard-record-level \{ display: inline-grid;[^}]*border-top: 0;/);
  assert.match(css,/\.dashboard-record-toolbar-row > \.dashboard-fleet-search \{[^}]*margin-left: auto;/);
  assert.match(css,/\.dashboard-record-toolbar-row > \.dashboard-fleet-search input \{[^}]*border-radius: 999px;/);
  assert.match(css,/\.dashboard-fleet-search-label \{[^}]*position: absolute;[^}]*clip: rect\(0, 0, 0, 0\);/,'search label is hidden even when dashboard font sizes override it');
});

test('OEM breakdown drilldown moves the door and chassis search into the top filter row',()=>{
  assert.match(oemJsx,/<label className="mine-oem-local-filter"><select aria-label="Equipment group"[\s\S]*?<\/label>\s*<label className="mine-oem-inline-search"><Search \/><input type="search" aria-label="Search OEM breakdown records" placeholder="Search door number, chassis, site, model or status"/,'search sits after the equipment group filter');
  assert.match(oemJsx,/<DashboardRecordBrowser [^>]*hideHierarchyFilters hideFleetSearch showDateFilter=\{false\}/,'duplicate table search is hidden for OEM details');
  assert.match(oemCss,/\.mine-oem-modal \.mine-oem-detail-search \.mine-oem-inline-search \{[^}]*flex: 1 1 360px;/,'search has room beside the filters');
});

test('the chip rows are graphical: gradient selection with underline, count badges, sheen and lift',()=>{
  assert.match(css,/\.dashboard-record-tabs button\[aria-selected="true"\], \.dashboard-record-level-tabs > button\[aria-pressed="true"\][^{]*\{ color: #fff; background: linear-gradient\(135deg, #7c3aed, #4c1d95\);/);
  assert.match(css,/button\[aria-pressed="true"\]::after \{[^}]*background: #ffd166;[^}]*animation: record-underline \.5s ease-out both; \}/);
  assert.match(css,/\.dashboard-record-tabs button:hover, \.dashboard-record-level-tabs > button:hover \{ transform: translateY\(-1px\);/);
  assert.match(css,/\.dashboard-record-level\[data-level="site"\] \{ --level-mark: #0ea5e9; \}/);
  assert.match(css,/\.dashboard-record-reset:hover:not\(:disabled\) svg \{ animation: record-reset-spin \.8s linear; \}/);
  for(const name of ['record-chip-in','record-underline','record-reset-spin','record-search-scan'])assert.match(css,new RegExp(`@keyframes ${name} \\{`),name);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css,/:root\[data-theme="dark"\] \.dashboard-record-tabs, :root\[data-theme="dark"\] \.dashboard-record-level-tabs \{/,'night mode variant');
});
