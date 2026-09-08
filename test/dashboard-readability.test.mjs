import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read=name=>readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
const css=read('dashboard-readability.css').replace(/\/\*[\s\S]*?\*\//g,'');
const client=read('main.jsx');
const managerScroll=read('manager-scroll.css');
const rule=selector=>{
  const result=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([,selectors])=>selectors.split(/,\r?\n/).some(value=>value.trim()===selector));
  assert.ok(result,`Missing readable dashboard rule: ${selector}`);
  return result[2];
};

test('the dashboard readability overrides load after every other stylesheet for every role',()=>{
  const imports=[...client.matchAll(/import ["'](.+\.css)["'];/g)].map(match=>match[1]);
  assert.equal(imports.at(-1),'./dashboard-readability.css');
  assert.equal(imports.filter(path=>path==='./dashboard-readability.css').length,1);
  assert.match(css,/:is\(\.mine-dashboard, \.manager-dashboard\)\s*\{/);
  const normal=client.slice(client.indexOf('function Normal('),client.indexOf('function App('));
  assert.match(normal,/section===?"dashboard"[\s\S]*?<Dashboard/);
  const app=client.slice(client.indexOf('function App('));
  assert.match(app,/active === "Dashboard"[\s\S]*?<Dashboard/);
  assert.match(app,/active === "Manager Profile"[\s\S]*?<ManagerDashboard/);
});

test('shared and manager dashboards use a readable base with larger KPI labels and values',()=>{
  for(const [name,min] of [['copy',15],['label',18],['value',32]]){
    const floors=[...css.matchAll(new RegExp(`--dash-${name}:\\s*(?:clamp\\()?([\\d.]+)px`,'g'))].map(match=>Number(match[1]));
    assert.ok(floors.length,`Missing ${name} token`);
    assert.ok(floors.every(value=>value>=min),`${name} token must retain its readable minimum`);
  }
  assert.match(rule('.mine-dashboard :is(p, label, small, em, span, b)'),/font-size:\s*var\(--dash-copy\) !important/);
  assert.match(rule('.manager-dashboard :is(button, input, select, th, td)'),/font-size:\s*var\(--dash-copy\) !important/);
  assert.match(rule('.mine-dashboard .mine-breakdown-movement-kpis span'),/font-size:\s*var\(--dash-label\) !important/);
  assert.match(rule('.manager-dashboard .manager-kpi-grid > button > span'),/font-size:\s*var\(--dash-label\)/);
  assert.match(rule('.manager-dashboard .manager-kpi-grid strong'),/font-size:\s*var\(--dash-value\) !important/);
});

test('larger dashboard copy reflows responsively without scaling or concealing page overflow',()=>{
  assert.match(css,/@media \(max-width: 1200px\)[\s\S]*?\.mine-dashboard \.mine-dashboard-core,[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css,/@media \(max-width: 700px\)[\s\S]*?\.mine-dashboard \.mine-head-actions :is\(input, select\)[^}]*font-size:\s*16px !important/);
  assert.match(rule('.manager-dashboard :is(.manager-role-tabs, .manager-queue-tabs)'),/flex-wrap:\s*wrap/);
  assert.doesNotMatch(css,/\bzoom\s*:|\btransform\s*:\s*[^;{}]*scale/i);
  assert.doesNotMatch(css,/(?:^|[}\n])\s*(?:html|body|:root|\.app|\.normal)\s*(?:,|\{)/);
  assert.doesNotMatch(css,/(?:^|[;{])\s*overflow(?:-x)?\s*:\s*(?:hidden|clip)/);
});

test('wide dashboard and manager tables retain their own scroll containment',()=>{
  const tables=rule('.mine-dashboard :is(.mine-breakdown-site-table, .mine-road-site-table)');
  assert.match(tables,/overflow:\s*auto/);
  assert.match(tables,/max-width:\s*100%/);
  assert.match(managerScroll,/\.manager-detail-panel > \.scroll\s*\{[^}]*overflow:\s*auto/);
  assert.match(managerScroll,/\.manager-detail-panel > \.scroll th\s*\{[^}]*position:\s*sticky/);
  assert.match(managerScroll,/\.manager-dashboard\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/);
});

test('long fleet site names and KPI labels wrap instead of truncating',()=>{
  const siteLabels=rule('.mine-dashboard .mine-fleet-chart-sites small');
  for(const property of [/white-space:\s*normal/,/overflow:\s*visible/,/overflow-wrap:\s*anywhere/])assert.match(siteLabels,property);
  assert.match(rule('.mine-dashboard .mine-breakdown-movement-kpis span'),/overflow-wrap:\s*anywhere/);
  assert.match(rule('.mine-dashboard .mine-fleet-chart-regions footer'),/flex-wrap:\s*wrap/);
});

test('lower dashboard cards reserve enough space for group names, lifecycle counts and gauges',()=>{
  assert.match(client,/className="mine-hierarchy-groups"/);
  assert.match(rule('.mine-dashboard .mine-hierarchy-groups'),/max-height:\s*300px/);
  const hierarchyLabels=rule('.mine-dashboard :is(.mine-hierarchy-categories, .mine-hierarchy-groups) b');
  assert.match(hierarchyLabels,/white-space:\s*normal/);
  assert.match(hierarchyLabels,/overflow-wrap:\s*anywhere/);
  assert.match(rule('.mine-dashboard :is(.mine-hierarchy-categories, .mine-hierarchy-groups) strong'),/font-size:\s*22px !important/);
  assert.match(rule('.mine-dashboard .mine-request-lifecycle-summary'),/grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css,/@media \(max-width: 700px\)[\s\S]*?\.mine-dashboard \.mine-request-lifecycle-summary\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(rule('.mine-dashboard .mine-request-lifecycle-summary button :is(span, b, small)'),/white-space:\s*normal/);
  assert.match(rule('.mine-dashboard .mine-request-chart-days'),/grid-auto-columns:\s*minmax\(120px, 1fr\)/);
  assert.match(rule('.mine-dashboard .mine-request-chart-day button'),/width:\s*24px/);
  assert.match(rule('.mine-dashboard .mine-request-chart-day button b'),/top:\s*-24px/);
  assert.match(rule('.mine-dashboard .mine-trend-day'),/min-width:\s*60px;\s*flex:\s*1 0 60px/);
  assert.match(rule('.mine-dashboard .mine-site-road-gauge'),/flex:\s*0 0 90px;\s*width:\s*90px;\s*height:\s*90px/);
});
