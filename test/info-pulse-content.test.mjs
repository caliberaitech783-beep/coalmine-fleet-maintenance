import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformWithOxc} from 'vite';
import * as data from '../info-pulse-data.mjs';
import {parseIstTimestamp} from '../ai-feeder.mjs';
import * as dates from '../date-time-format.mjs';
import {requestStatusLabel} from '../src/request-status.mjs';
import * as timing from '../src/info-pulse-timing.mjs';

const source = readFileSync(new URL('../src/info-pulse-content.jsx', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export default function', 'function');
const {code} = await transformWithOxc(source, 'pulse-content.jsx', {jsx: {runtime: 'classic'}});
const NOW = Date.parse('2026-09-16T11:00:00+05:30');
function descendants(tree, predicate) {
  const result = [];
  const visit = node => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!React.isValidElement(node)) return;
    if (predicate(node)) result.push(node);
    visit(node.props.children);
  };
  visit(tree);
  return result;
}
const byLabel = (tree, label) => descendants(tree, node => node.props['aria-label'] === label)[0];
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : React.isValidElement(tree) ? text(tree.props.children) : String(tree ?? '');
const html = tree => renderToStaticMarkup(tree).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const vehicles = tree => descendants(tree, node => node.props.className === 'pulse-row-vehicle').map(text);
const part = (node, index) => {const children = node.props.children; return text(Array.isArray(children) ? children[index] : index ? '' : children);};
const chips = (tree, group) => descendants(byLabel(tree, group), node => node.type === 'button').map(node => `${part(node, 0)}:${part(node, 1)}`);
const chip = (tree, group, label) => descendants(byLabel(tree, group), node => node.type === 'button' && part(node, 0) === label)[0];
const kpi = (tree, label) => Number(text(descendants(descendants(tree, node => String(node.props['aria-label'] || '').startsWith(`${label}: `))[0], node => node.props.className === 'pulse-kpi-count')[0]));
const kpiCounts = tree => Object.fromEntries(['BD balance', 'Critical', 'Warning', 'Open'].map(label => [label, kpi(tree, label)]));
const REQUESTS = [
  {ref: 'REQ-V167', door: 'V167', reg: 'MH34BZ3284', site: 'Dhoptala OB (2nd)', equipmentGroup: 'VOLVO TIPPERS', meterType: 'KMR', status: 'Open', start: '2026-09-16 06:02', expectedCompletionAt: '2026-09-16 06:20', complaint: 'RHS 2nd axle main leaf spring broken'},
  {ref: 'REQ-S145', door: 'S145', site: 'Sasti OB', equipmentGroup: 'SCANIA TIPPERS', status: 'Open', start: '2026-09-16 09:36', expectedCompletionAt: '2026-09-16 13:00', complaint: 'Third axle oil seal leakage'},
  {ref: 'REQ-D38', door: 'D38', site: 'Majri OB', equipmentGroup: 'DOZERS', meterType: 'HMR', status: 'Open', start: '2026-09-14 08:01', complaint: 'LHS track chain loose and battery terminal damage'},
  {ref: 'REQ-W1', door: 'W1', site: 'Majri OB', equipmentGroup: 'EICHER TIPPERS', status: 'Open', start: '2026-09-15 20:00', complaint: 'Gear box noise'},
  {ref: 'REQ-J9', door: 'J9', site: 'Jayant OB', equipmentGroup: 'DRILL MACHINE', status: 'Open', start: '2026-09-16 02:00', complaint: 'Compressor fault'},
  {ref: 'REQ-IDLE', door: 'E110', site: 'Majri OB', status: 'Idle', start: '2026-09-10 08:00', complaint: 'No operator'},
  {ref: 'REQ-CLOSED', door: 'S55', site: 'Sasti OB', status: 'Closed', start: '2026-09-09 08:00', closedAt: '2026-09-15 08:00', complaint: 'Brake liner broken'},
  {ref: 'REQ-VERIFIED', door: 'S6', site: 'Sasti OB', status: 'Open', verifiedAt: '2026-09-15 09:00', start: '2026-09-08 08:00', complaint: 'Leaf spring broken'},
];
function harness() {
  const slots = [];
  let cursor = 0;
  const bindings = {
    React, ...data, ...dates, ...timing, requestStatusLabel, parseIstTimestamp,
    useState(initial) {const slot = cursor++; if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial; return [slots[slot], next => {slots[slot] = typeof next === 'function' ? next(slots[slot]) : next;}];},
    ...Object.fromEntries(['RefreshCw', 'MapPin', 'Truck', 'AlertTriangle', 'Activity', 'Clock', 'RotateCcw'].map(name => [name, () => null])),
  };
  const Component = new Function(...Object.keys(bindings), `${code}; return InfoPulseContent;`)(...Object.values(bindings));
  return {render(overrides = {}) {
    cursor = 0;
    const requests = overrides.requests || REQUESTS;
    return Component({breakdowns: data.buildInfoPulseBreakdowns(requests), scope: {label: 'All regions', sites: null}, now: NOW, updatedAt: NOW, ready: true, error: '', refreshing: false, onRefresh() {}, ...overrides});
  }};
}
const render = overrides => harness().render(overrides);
// Most list assertions look at every open breakdown, so they switch the default today range to all dates.
function allDates(overrides = {}) {
  const app = harness();
  chip(app.render(overrides), 'Info Pulse period', 'All dates').props.onClick();
  return {app, tree: app.render(overrides)};
}

test('opens on today in IST with BD balance selected, the Today preset active and the record count shown', () => {
  const tree = render();
  assert.deepEqual([byLabel(tree, 'Info Pulse from date').props.value, byLabel(tree, 'Info Pulse to date').props.value], ['2026-09-16', '2026-09-16']);
  assert.equal(chip(tree, 'Info Pulse period', 'Today').props['aria-pressed'], true);
  assert.equal(chip(tree, 'Info Pulse period', 'All dates').props['aria-pressed'], false);
  assert.equal(byLabel(tree, 'BD balance: 3').props['aria-pressed'], true);
  assert.deepEqual(kpiCounts(tree), {'BD balance': 3, Critical: 0, Warning: 0, Open: 3});
  assert.deepEqual(vehicles(byLabel(tree, 'BD balance breakdowns, longest standing first')), ['J9', 'V167', 'S145']);
  assert.match(html(tree), /3 of 5 records/);
  assert.match(html(tree), /Filters All regions · 16-09-2026/);
  assert.equal(descendants(tree, node => node.props.className === 'pulse-reset')[0].props.disabled, true);
  // Reopening on another day defaults to that day.
  const later = render({now: NOW + 86_400_000});
  assert.deepEqual([byLabel(later, 'Info Pulse from date').props.value, byLabel(later, 'Info Pulse to date').props.value], ['2026-09-17', '2026-09-17']);
  assert.match(html(later), /No open breakdowns started today\. BD balance is 0\./);
});

test('All dates lists every open breakdown longest standing first with its reason, excluding idle, closed and verified', () => {
  const {tree} = allDates();
  assert.deepEqual(kpiCounts(tree), {'BD balance': 5, Critical: 1, Warning: 1, Open: 3});
  const list = byLabel(tree, 'BD balance breakdowns, longest standing first');
  assert.equal(list.type, 'ol');
  assert.deepEqual(vehicles(list), ['D38', 'W1', 'J9', 'V167', 'S145']);
  assert.deepEqual(descendants(list, node => node.props.className === 'pulse-rank').map(text), ['1', '2', '3', '4', '5']);
  const body = html(list);
  for (const reason of ['LHS track chain loose and battery terminal damage', 'Gear box noise', 'RHS 2nd axle main leaf spring broken', 'Third axle oil seal leakage']) assert.ok(body.includes(reason), reason);
  assert.ok(body.includes('Majri OB') && body.includes('DOZERS · REQ-D38') && body.includes('VOLVO TIPPERS · REQ-V167'));
  for (const excluded of ['E110', 'S55', 'S6', 'No operator', 'Brake liner']) assert.ok(!body.includes(excluded), `${excluded} excluded`);
  assert.match(html(tree), /5 of 5 breakdowns · All regions · All dates/);
});

test('rows are tinted by standing time: critical from 24 hours, warning from 12 hours, open below that', () => {
  const rows = descendants(byLabel(allDates().tree, 'BD balance breakdowns, longest standing first'), node => node.type === 'li');
  assert.deepEqual(rows.map(row => row.props.className), ['pulse-breakdown-row critical', 'pulse-breakdown-row warning', 'pulse-breakdown-row open', 'pulse-breakdown-row open', 'pulse-breakdown-row open']);
  assert.deepEqual(rows.slice(0, 3).map(row => text(descendants(row, node => node.props.className?.startsWith('pulse-tier-tag'))[0])), ['Critical · 24h+', 'Warning · 12h+', 'Under 12h']);
  const hour = 3_600_000;
  assert.equal(timing.pulseStandingTier(24 * hour), 'critical');
  assert.equal(timing.pulseStandingTier(24 * hour - 1), 'warning');
  assert.equal(timing.pulseStandingTier(12 * hour), 'warning');
  assert.equal(timing.pulseStandingTier(12 * hour - 1), 'open');
  assert.deepEqual(timing.pulseTierCounts(timing.pulseBreakdownRows(data.buildInfoPulseBreakdowns(REQUESTS), NOW)), {all: 5, critical: 1, warning: 1, open: 3});
});

test('clicking a KPI card narrows the list to that tier, renumbers it, and BD balance restores everything', () => {
  const {app} = allDates();
  let tree = app.render();
  byLabel(tree, 'Critical: 1').props.onClick();
  tree = app.render();
  assert.equal(byLabel(tree, 'Critical: 1').props['aria-pressed'], true);
  assert.equal(byLabel(tree, 'BD balance: 5').props['aria-pressed'], false);
  assert.deepEqual(vehicles(byLabel(tree, 'Critical breakdowns, longest standing first')), ['D38']);
  assert.match(html(tree), /Critical Standing in breakdown for 24 hours or more\. 1 of 5 breakdowns/);
  assert.match(html(tree), /1 of 5 records/);
  byLabel(tree, 'Open: 3').props.onClick();
  tree = app.render();
  const list = byLabel(tree, 'Open breakdowns, longest standing first');
  assert.deepEqual(vehicles(list), ['J9', 'V167', 'S145']);
  assert.deepEqual(descendants(list, node => node.props.className === 'pulse-rank').map(text), ['1', '2', '3']);
  byLabel(tree, 'BD balance: 5').props.onClick();
  tree = app.render();
  assert.deepEqual(vehicles(byLabel(tree, 'BD balance breakdowns, longest standing first')), ['D38', 'W1', 'J9', 'V167', 'S145']);
  byLabel(tree, 'Warning: 1').props.onClick();
  tree = app.render({requests: REQUESTS.filter(request => request.ref !== 'REQ-W1')});
  assert.ok(byLabel(tree, 'Warning: 0'));
  assert.match(html(tree), /No breakdowns match this selection\./);
});

test('region tabs, site chips and equipment/vehicle chips cascade with counts like the dashboard record browser', () => {
  const {app} = allDates();
  let tree = app.render();
  assert.deepEqual(chips(tree, 'Breakdowns by region'), ['All regions:5', 'WCL:4', 'NCL:1']);
  assert.equal(chip(tree, 'Breakdowns by region', 'All regions').props['aria-selected'], true);
  assert.deepEqual(chips(tree, 'Site choices'), ['All sites:5', 'Dhoptala OB (2nd):1', 'Jayant OB:1', 'Majri OB:2', 'Sasti OB:1']);
  assert.deepEqual(chips(tree, 'Equipment / Vehicle choices'), ['All equipment & vehicles:5', 'Equipment:2', 'Vehicles:3']);
  chip(tree, 'Breakdowns by region', 'WCL').props.onClick();
  tree = app.render();
  assert.equal(chip(tree, 'Breakdowns by region', 'WCL').props['aria-selected'], true);
  assert.deepEqual(chips(tree, 'Site choices'), ['All sites:4', 'Dhoptala OB (2nd):1', 'Majri OB:2', 'Sasti OB:1']);
  assert.deepEqual(kpiCounts(tree), {'BD balance': 4, Critical: 1, Warning: 1, Open: 2});
  assert.match(html(tree), /Every open breakdown in WCL/);
  chip(tree, 'Site choices', 'Majri OB').props.onClick();
  tree = app.render();
  assert.equal(chip(tree, 'Site choices', 'Majri OB').props['aria-pressed'], true);
  assert.deepEqual(chips(tree, 'Equipment / Vehicle choices'), ['All equipment & vehicles:2', 'Equipment:1', 'Vehicles:1']);
  assert.deepEqual(vehicles(byLabel(tree, 'BD balance breakdowns, longest standing first')), ['D38', 'W1']);
  assert.match(html(tree), /Every open breakdown in Majri OB/);
  assert.match(html(tree), /2 of 5 records/);
  chip(tree, 'Equipment / Vehicle choices', 'Vehicles').props.onClick();
  tree = app.render();
  assert.deepEqual(vehicles(byLabel(tree, 'BD balance breakdowns, longest standing first')), ['W1']);
  assert.match(html(tree), /Filters WCL · Majri OB · Vehicles · All dates/);
  // Changing the region clears the site and category below it.
  chip(tree, 'Breakdowns by region', 'NCL').props.onClick();
  tree = app.render();
  assert.deepEqual(chips(tree, 'Equipment / Vehicle choices'), ['All equipment & vehicles:1', 'Equipment:1']);
  assert.equal(byLabel(tree, 'Site choices'), undefined, 'one site in NCL needs no site chips');
  assert.deepEqual(vehicles(byLabel(tree, 'BD balance breakdowns, longest standing first')), ['J9']);
  // Reset selection restores every region and today's date.
  descendants(tree, node => node.props.className === 'pulse-reset')[0].props.onClick();
  tree = app.render();
  assert.equal(chip(tree, 'Breakdowns by region', 'All regions').props['aria-selected'], true);
  assert.equal(chip(tree, 'Info Pulse period', 'Today').props['aria-pressed'], true);
  assert.deepEqual(vehicles(byLabel(tree, 'BD balance breakdowns, longest standing first')), ['J9', 'V167', 'S145']);
});

test('single-region and single-site scopes hide the region tabs and site chips but keep the date and category filters', () => {
  const single = REQUESTS.filter(request => request.site === 'Sasti OB');
  const tree = render({requests: single, scope: {label: 'Sasti OB', sites: ['Sasti OB']}});
  assert.equal(byLabel(tree, 'Breakdowns by region'), undefined);
  assert.equal(byLabel(tree, 'Site choices'), undefined);
  assert.match(html(tree), /Filters WCL · 16-09-2026/);
  assert.deepEqual(chips(tree, 'Equipment / Vehicle choices'), ['All equipment & vehicles:1', 'Vehicles:1']);
  assert.ok(byLabel(tree, 'Info Pulse from date') && byLabel(tree, 'Info Pulse to date'));
  const wcl = render({requests: REQUESTS.filter(request => request.site !== 'Jayant OB'), scope: {label: 'WCL', sites: ['Sasti OB', 'Majri OB', 'Dhoptala OB (2nd)']}});
  assert.equal(byLabel(wcl, 'Breakdowns by region'), undefined);
  assert.deepEqual(chips(wcl, 'Site choices'), ['All sites:2', 'Dhoptala OB (2nd):1', 'Sasti OB:1']);
});

test('the started-date range is inclusive on IST days, presets set today-anchored ranges, and a reversed range is flagged', () => {
  const app = harness();
  let tree = app.render();
  byLabel(tree, 'Info Pulse from date').props.onChange({target: {value: '2026-09-15'}});
  tree = app.render();
  assert.deepEqual(kpiCounts(tree), {'BD balance': 4, Critical: 0, Warning: 1, Open: 3});
  assert.deepEqual(vehicles(byLabel(tree, 'BD balance breakdowns, longest standing first')), ['W1', 'J9', 'V167', 'S145']);
  assert.match(html(tree), /15-09-2026 – 16-09-2026/);
  byLabel(tree, 'Info Pulse to date').props.onChange({target: {value: '2026-09-15'}});
  tree = app.render();
  assert.deepEqual(vehicles(byLabel(tree, 'BD balance breakdowns, longest standing first')), ['W1']);
  assert.equal(byLabel(tree, 'Info Pulse from date').props.max, '2026-09-15');
  assert.equal(byLabel(tree, 'Info Pulse to date').props.min, '2026-09-15');
  chip(tree, 'Info Pulse period', '7D').props.onClick();
  tree = app.render();
  assert.deepEqual([byLabel(tree, 'Info Pulse from date').props.value, byLabel(tree, 'Info Pulse to date').props.value], ['2026-09-10', '2026-09-16']);
  assert.equal(chip(tree, 'Info Pulse period', '7D').props['aria-pressed'], true);
  assert.equal(chip(tree, 'Info Pulse period', 'Today').props['aria-pressed'], false);
  assert.deepEqual(kpiCounts(tree), {'BD balance': 5, Critical: 1, Warning: 1, Open: 3});
  byLabel(tree, 'Info Pulse from date').props.onChange({target: {value: '2026-09-17'}});
  tree = app.render();
  assert.match(text(descendants(tree, node => node.props.role === 'alert')[0]), /From date must be on or before To date\./);
  assert.equal(descendants(tree, node => node.type === 'ol').length, 0);
  assert.deepEqual(kpiCounts(tree), {'BD balance': 0, Critical: 0, Warning: 0, Open: 0});
  byLabel(tree, 'Info Pulse from date').props.onChange({target: {value: ''}});
  byLabel(tree, 'Info Pulse to date').props.onChange({target: {value: ''}});
  tree = app.render();
  assert.equal(chip(tree, 'Info Pulse period', 'All dates').props['aria-pressed'], true);
  assert.deepEqual(kpiCounts(tree), {'BD balance': 5, Critical: 1, Warning: 1, Open: 3});
});

test('equipment and vehicle classification uses the meter type first and the group name otherwise', () => {
  assert.equal(data.infoPulseAssetCategory({meterType: 'KMR', equipmentGroup: 'DOZERS'}), 'Vehicles');
  assert.equal(data.infoPulseAssetCategory({meterType: 'hmr', equipmentGroup: 'VOLVO TIPPERS'}), 'Equipment');
  assert.equal(data.infoPulseAssetCategory({equipmentGroup: 'SCANIA TIPPERS'}), 'Vehicles');
  assert.equal(data.infoPulseAssetCategory({equipmentGroup: 'Water Tanker'}), 'Vehicles');
  assert.equal(data.infoPulseAssetCategory({equipmentGroup: 'DRILL MACHINE'}), 'Equipment');
  assert.equal(data.infoPulseAssetCategory({}), 'Equipment');
  assert.deepEqual(data.infoPulseRegions(null).map(region => `${region.code}:${region.sites.length}`), ['WCL:5', 'NCL:4']);
  assert.deepEqual(data.infoPulseRegions(['sasti ob', 'Jayant OB']).map(region => `${region.code}:${region.sites.join('|')}`), ['WCL:Sasti OB', 'NCL:Jayant OB']);
  assert.deepEqual(data.infoPulseRegions([]), []);
});

test('the redesign has no alert categories, pagination or drill-downs', () => {
  const tree = render();
  assert.equal(descendants(tree, node => 'aria-expanded' in node.props).length, 0);
  const page = html(tree);
  for (const removed of ['Updates', 'ETC overdue', 'Down ≥ 3 days', 'New ≤ 12 hours', 'All cases', 'Total breakdowns', 'of 4 cases', 'Filter site']) assert.ok(!page.includes(removed), `${removed} removed`);
  assert.ok(!source.includes('PAGE_SIZE') && !source.includes('createPortal'));
});

test('each row shows standing since, down for and the ETC as overdue, due in or not set', () => {
  const rows = descendants(byLabel(allDates().tree, 'BD balance breakdowns, longest standing first'), node => node.type === 'li');
  const [dozer, , , volvo, scania] = rows.map(html);
  assert.match(dozer, /Standing since 14-09-2026 08:01(:00)? AM Down for 2d 2h 59m ETC Not set/);
  assert.match(volvo, /Standing since 16-09-2026 06:02(:00)? AM Down for 4h 58m ETC 16-09-2026 06:20(:00)? AM Overdue by 4h 40m/);
  assert.match(scania, /Standing since 16-09-2026 09:36(:00)? AM Down for 1h 24m ETC 16-09-2026 01:00(:00)? PM Due in 2h 0m/);
  const annotated = timing.pulseBreakdownRows(data.buildInfoPulseBreakdowns(REQUESTS), NOW);
  assert.equal(annotated[0].share, 1, 'longest standing fills the bar');
  assert.equal(annotated[3].share.toFixed(3), (298 / 3059).toFixed(3));
  assert.equal(annotated[4].share, 0.03, 'short stoppages keep a visible sliver');
  assert.deepEqual(descendants(rows[0], node => node.props.className === 'pulse-standing-bar')[0].props.style, {'--fill': 1});
});

test('missing start, unparseable ETC and missing complaint render explicit placeholders instead of crashing', () => {
  const requests = [{ref: 'REQ-BLANK', site: 'Sasti OB', status: 'Open', expectedCompletionAt: 'soon'}];
  const {tree} = allDates({requests});
  const row = html(byLabel(tree, 'BD balance breakdowns, longest standing first'));
  assert.ok(row.includes('Breakdown reason Not recorded'));
  assert.ok(row.includes('Standing since Not recorded Down for Not recorded ETC Not recorded'));
  const [annotated] = timing.pulseBreakdownRows(data.buildInfoPulseBreakdowns(requests), NOW);
  assert.equal(annotated.etcState, 'unknown');
  assert.equal(annotated.tier, 'open');
  assert.ok(byLabel(tree, 'BD balance: 1') && byLabel(tree, 'Open: 1'));
  // With today's range a request without a start date is not dated, so it stays out until All dates is chosen.
  assert.ok(byLabel(render({requests}), 'BD balance: 0'));
});

test('loading, failures and an empty balance never render a misleading count and retry is actionable', () => {
  let refreshes = 0;
  const onRefresh = () => refreshes++;
  let tree = render({ready: false, breakdowns: [], refreshing: true, onRefresh});
  for (const label of ['BD balance', 'Critical', 'Warning', 'Open']) assert.equal(text(descendants(byLabel(tree, `${label}: unavailable`), node => node.props.className === 'pulse-kpi-count')[0]), '—');
  assert.match(html(tree), /Loading breakdowns…/);
  assert.equal(descendants(tree, node => node.type === 'ol').length, 0);
  assert.equal(byLabel(tree, 'Refresh Info Pulse').props.disabled, true);
  tree = render({ready: false, breakdowns: [], error: 'offline', onRefresh});
  const alert = descendants(tree, node => node.props.role === 'alert')[0];
  assert.match(text(alert), /Could not load breakdowns\./);
  descendants(alert, node => node.type === 'button')[0].props.onClick();
  assert.equal(refreshes, 1);
  tree = render({error: 'offline', onRefresh});
  assert.match(text(descendants(tree, node => node.props.role === 'alert')[0]), /Refresh failed\. Showing the last loaded breakdowns\./);
  assert.ok(byLabel(tree, 'BD balance: 3'));
  tree = render({requests: [REQUESTS[5], REQUESTS[6]], updatedAt: 0});
  assert.ok(byLabel(tree, 'BD balance: 0') && byLabel(tree, 'Critical: 0'));
  assert.match(html(tree), /No open breakdowns started today\. BD balance is 0\./);
  assert.match(html(tree), /Not refreshed yet/);
});

test('the panel header drops the total pill and the trigger badge carries the BD balance', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  assert.match(main, /<h2 id="ai-feeder-title">Open breakdowns<\/h2><\/div>/);
  assert.ok(!main.includes('pulse-heading-total') && !main.includes('headerTarget'));
  assert.match(main, /const breakdowns = useMemo\(\(\) => ready \? buildInfoPulseBreakdowns\(requests\) : \[\], \[requests, ready\]\);/);
  assert.match(main, /aria-label=\{`Info Pulse, \$\{ready \? "BD balance " \+ breakdowns\.length : "BD balance unavailable"\}`\}/);
  assert.match(main, /<b className="ai-feeder-trigger-count">\{breakdowns\.length\}<\/b>/);
  assert.match(main, /<InfoPulseContent breakdowns=\{breakdowns\} scope=\{scope\} now=\{now\}/);
  assert.ok(!main.includes('buildInfoPulseCases'));
});

test('Info Pulse opens full screen with its content scrolling inside the panel', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/info-pulse-content.css', import.meta.url), 'utf8');
  assert.match(main, /<div className="ai-feeder-overlay pulse-overlay">\s*<div className="ai-feeder-panel pulse-panel"/);
  assert.match(css, /\.ai-feeder-overlay\.pulse-overlay \{ padding: 0; \}/);
  assert.match(css, /\.ai-feeder-panel\.pulse-panel \{ width: 100vw; height: 100dvh; max-height: 100dvh; border-radius: 0; border: 0; box-shadow: none; \}/);
  assert.match(css, /\.pulse-panel \.pulse-content \{ flex: 1 1 auto; \}/);
  assert.match(css, /\.pulse-content \{[^}]*overflow: auto;[^}]*min-height: 0;/);
});

test('filters, KPI cards and rows follow the dashboard record-browser styling and stack on narrow screens', () => {
  const css = readFileSync(new URL('../src/info-pulse-content.css', import.meta.url), 'utf8');
  assert.match(css, /\.pulse-filter-panel:not\(\[open\]\) \.pulse-hide-filters, \.pulse-filter-panel\[open\] \.pulse-show-filters \{ display: none; \}/);
  assert.match(css, /\.pulse-region-tabs button\[aria-selected="true"\] \{ background: var\(--record-purple\); color: #fff;/);
  assert.match(css, /\.pulse-filter-level\[data-level="site"\] \.pulse-filter-chips > button\[aria-pressed="true"\] \{ background: var\(--record-purple\); color: #fff;/);
  assert.match(css, /\.pulse-record-count \{[^}]*background: var\(--record-purple\); color: #fff;/);
  assert.match(css, /\.pulse-kpis \{ display: grid; grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.pulse-kpi\.critical \{ --kpi: #b01c37;/);
  assert.match(css, /\.pulse-kpi\.selected \{ border-color: var\(--kpi\); background: var\(--kpi-soft\);/);
  assert.match(css, /\.pulse-breakdown-row \{[^}]*grid-template-columns: 40px minmax\(200px, \.85fr\) minmax\(220px, 1\.5fr\) auto; align-items: center;/);
  assert.match(css, /\.pulse-breakdown-row\.critical \{ --tier: #c8233f;/);
  assert.match(css, /\.pulse-breakdown-row\.warning \{ --tier: #e0a300;/);
  assert.match(css, /@media \(max-width: 1000px\) \{[^@]*\.pulse-kpis \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}[^@]*\.pulse-breakdown-row \{ grid-template-columns: 40px 1fr; \}/);
  assert.match(css, /@media \(max-width: 650px\) \{[^@]*\.pulse-region-tabs \{ width: 100%;/);
  assert.ok(!css.includes('pulse-heading-total') && !css.includes('pulse-breakdown-total') && !css.includes('pulse-case-card') && !css.includes('pulse-pagination'));
});
