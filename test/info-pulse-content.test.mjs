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
import * as reasons from '../src/info-pulse-reasons.mjs';

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
  {ref: 'REQ-D38', door: 'D38', site: 'Majri OB', equipmentGroup: 'DOZERS', meterType: 'HMR', status: 'Open', start: '2026-09-14 08:01', complaint: 'LHS track chain loose and battery terminal damage', dailyRemarks: [{createdAt: '2026-09-14 18:00', authorName: 'Site team', remark: 'Chain inspected', delayReason: 'Vendor inspection pending'}, {createdAt: '2026-09-15 18:30', authorName: 'Maintenance team', remark: 'Battery replaced', delayReason: 'Awaiting track chain from supplier'}]},
  {ref: 'REQ-W1', door: 'W1', site: 'Majri OB', equipmentGroup: 'EICHER TIPPERS', status: 'Open', start: '2026-09-15 20:00', complaint: 'Gear box noise', overdueReason: 'Gear box sent to workshop', dailyRemarks: [{createdAt: '2026-09-16 08:00', remark: 'Opened gear box', delayReason: 'Spares not in stock'}]},
  {ref: 'REQ-J9', door: 'J9', site: 'Jayant OB', equipmentGroup: 'DRILL MACHINE', status: 'Open', start: '2026-09-16 02:00', complaint: 'Compressor fault'},
  {ref: 'REQ-IDLE', door: 'E110', site: 'Majri OB', status: 'Idle', start: '2026-09-10 08:00', complaint: 'No operator'},
  {ref: 'REQ-CLOSED', door: 'S55', site: 'Sasti OB', status: 'Closed', start: '2026-09-09 08:00', closedAt: '2026-09-15 08:00', complaint: 'Brake liner broken'},
  {ref: 'REQ-VERIFIED', door: 'S6', site: 'Sasti OB', status: 'Open', verifiedAt: '2026-09-15 09:00', start: '2026-09-08 08:00', complaint: 'Leaf spring broken'},
];
function harness() {
  const slots = [], effects = [], timers = [];
  let cursor = 0;
  const bindings = {
    React, ...data, ...dates, ...timing, ...reasons, requestStatusLabel, parseIstTimestamp,
    useState(initial) {const slot = cursor++; if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial; return [slots[slot], next => {slots[slot] = typeof next === 'function' ? next(slots[slot]) : next;}];},
    useEffect(callback) {const slot = cursor++; if (!(slot in slots)) {slots[slot] = true; effects.push(callback);}},
    setTimeout(callback, delay) {timers.push({callback, delay}); return timers.length;},
    clearTimeout() {},
    ...Object.fromEntries(['RefreshCw', 'MapPin', 'Truck', 'AlertTriangle', 'Activity', 'Clock', 'RotateCcw'].map(name => [name, () => null])),
  };
  const Component = new Function(...Object.keys(bindings), `${code}; return InfoPulseContent;`)(...Object.values(bindings));
  return {effects, timers, render(overrides = {}) {
    cursor = 0;
    const requests = overrides.requests || REQUESTS;
    const tree = Component({breakdowns: data.buildInfoPulseBreakdowns(requests), scope: {label: 'All regions', sites: null}, now: NOW, updatedAt: NOW, ready: true, error: '', refreshing: false, onRefresh() {}, ...overrides});
    effects.splice(0).forEach(callback => callback());
    return tree;
  }};
}
const render = overrides => harness().render(overrides);
test('daily updates expand per breakdown, newest first, and stay current after refresh', () => {
  const app = harness();
  let tree = app.render();
  const button = () => byLabel(tree, 'Daily updates for D38');
  const history = () => byLabel(tree, 'Daily update history for REQ-D38');
  assert.equal(button().props['aria-expanded'], false);
  assert.equal(history().props.hidden, true);
  assert.equal(button().props['aria-controls'], history().props.id);
  button().props.onClick();
  tree = app.render();
  assert.equal(button().props['aria-expanded'], true);
  assert.equal(history().props.hidden, false);
  const content = html(history());
  assert.ok(content.indexOf('Battery replaced') < content.indexOf('Chain inspected'));
  assert.match(content, /Maintenance team/);
  assert.match(content, /Vendor inspection pending/);
  assert.equal(byLabel(tree, 'Daily updates for W1').props['aria-expanded'], false);
  tree = app.render({requests: REQUESTS.map(request => request.ref === 'REQ-D38' ? {...request, dailyRemarks: [{remark: 'Fresh saved note', delayedReason: 'New delay reason', authorLogin: 'mechanic'}]} : request)});
  assert.match(html(history()), /Fresh saved note.*New delay reason/);
  assert.match(html(history()), /Date not recorded.*mechanic/);
  button().props.onClick();
  tree = app.render();
  assert.equal(history().props.hidden, true);
  byLabel(tree, 'Daily updates for J9').props.onClick();
  tree = app.render();
  assert.match(html(byLabel(tree, 'Daily update history for REQ-J9')), /No daily updates recorded/);
});
// Most list assertions look at every open breakdown, so they switch the default today range to all dates.
function allDates(overrides = {}) {
  const app = harness();
  chip(app.render(overrides), 'Info Pulse period', 'All dates').props.onClick();
  return {app, tree: app.render(overrides)};
}

test('opens as the BD balance until today in IST: no From, To = today, every open breakdown started on or before today', () => {
  const tree = render();
  assert.deepEqual([byLabel(tree, 'Info Pulse from date').props.value, byLabel(tree, 'Info Pulse to date').props.value], ['', '2026-09-16']);
  assert.equal(chip(tree, 'Info Pulse period', 'Until today').props['aria-pressed'], true);
  assert.equal(chip(tree, 'Info Pulse period', 'Today').props['aria-pressed'], false);
  assert.equal(chip(tree, 'Info Pulse period', 'All dates').props['aria-pressed'], false);
  assert.equal(byLabel(tree, 'BD balance: 5').props['aria-pressed'], true);
  assert.deepEqual(kpiCounts(tree), {'BD balance': 5, Critical: 1, Warning: 1, Open: 3});
  assert.deepEqual(vehicles(byLabel(tree, 'BD balance breakdowns, longest standing first')), ['D38', 'W1', 'J9', 'V167', 'S145']);
  assert.match(html(tree), /5 of 5 records/);
  assert.match(html(tree), /Filters All regions · Until 16-09-2026/);
  assert.equal(descendants(tree, node => node.props.className === 'pulse-reset')[0].props.disabled, true);
  // A breakdown dated after "today" (clock skew) stays out; reopening on another day moves the bound to that day.
  const future = render({requests: [...REQUESTS, {ref: 'REQ-FUTURE', door: 'F1', site: 'Sasti OB', status: 'Open', start: '2026-09-17 01:00', complaint: 'Clock skew'}]});
  assert.ok(byLabel(future, 'BD balance: 5'));
  const later = render({now: NOW + 86_400_000});
  assert.deepEqual([byLabel(later, 'Info Pulse from date').props.value, byLabel(later, 'Info Pulse to date').props.value], ['', '2026-09-17']);
  assert.ok(byLabel(later, 'BD balance: 5'));
  // Started today is still one click away.
  const app = harness();
  chip(app.render(), 'Info Pulse period', 'Today').props.onClick();
  const todayTree = app.render();
  assert.deepEqual([byLabel(todayTree, 'Info Pulse from date').props.value, byLabel(todayTree, 'Info Pulse to date').props.value], ['2026-09-16', '2026-09-16']);
  assert.deepEqual(vehicles(byLabel(todayTree, 'BD balance breakdowns, longest standing first')), ['J9', 'V167', 'S145']);
  assert.match(html(todayTree), /3 of 5 records/);
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
  // Reset selection restores every region and the balance until today.
  descendants(tree, node => node.props.className === 'pulse-reset')[0].props.onClick();
  tree = app.render();
  assert.equal(chip(tree, 'Breakdowns by region', 'All regions').props['aria-selected'], true);
  assert.equal(chip(tree, 'Info Pulse period', 'Until today').props['aria-pressed'], true);
  assert.deepEqual(vehicles(byLabel(tree, 'BD balance breakdowns, longest standing first')), ['D38', 'W1', 'J9', 'V167', 'S145']);
});

test('single-region and single-site scopes hide the region tabs and site chips but keep the date and category filters', () => {
  const single = REQUESTS.filter(request => request.site === 'Sasti OB');
  const tree = render({requests: single, scope: {label: 'Sasti OB', sites: ['Sasti OB']}});
  assert.equal(byLabel(tree, 'Breakdowns by region'), undefined);
  assert.equal(byLabel(tree, 'Site choices'), undefined);
  assert.match(html(tree), /Filters WCL · Until 16-09-2026/);
  assert.deepEqual(chips(tree, 'Equipment / Vehicle choices'), ['All equipment & vehicles:1', 'Vehicles:1']);
  assert.ok(byLabel(tree, 'Info Pulse from date') && byLabel(tree, 'Info Pulse to date'));
  const wcl = render({requests: REQUESTS.filter(request => request.site !== 'Jayant OB'), scope: {label: 'WCL', sites: ['Sasti OB', 'Majri OB', 'Dhoptala OB (2nd)']}});
  assert.equal(byLabel(wcl, 'Breakdowns by region'), undefined);
  assert.deepEqual(chips(wcl, 'Site choices'), ['All sites:4', 'Dhoptala OB (2nd):1', 'Majri OB:2', 'Sasti OB:1']);
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
  assert.deepEqual(data.infoPulseRegions(null).map(region => `${region.code}:${region.sites.length}`), ['WCL:5', 'NCL:3']);
  assert.deepEqual(data.infoPulseRegions(['sasti ob', 'Jayant OB']).map(region => `${region.code}:${region.sites.join('|')}`), ['WCL:Sasti OB', 'NCL:Jayant OB']);
  assert.deepEqual(data.infoPulseRegions([]), []);
});

test('the redesign has no alert categories, numbered pagination or record drill-downs', () => {
  const tree = render();
  assert.ok(descendants(tree, node => 'aria-expanded' in node.props).every(node => node.props.className === 'pulse-updates-button'));
  const page = html(tree);
  for (const removed of ['Updates', 'ETC overdue', 'Down ≥ 3 days', 'New ≤ 12 hours', 'All cases', 'Total breakdowns', 'of 4 cases', 'Filter site']) assert.ok(!page.includes(removed), `${removed} removed`);
  assert.ok(!source.includes('PAGE_SIZE') && !source.includes('createPortal'));
});

test('large phone-friendly result sets render 24 rows first and expand without changing the filtered total', () => {
  const requests = Array.from({length: 30}, (_, index) => ({
    ref: `REQ-WINDOW-${index + 1}`,
    door: `WINDOW-${index + 1}`,
    site: 'Sasti OB',
    equipmentGroup: 'DOZERS',
    status: 'Open',
    start: `2026-09-16 ${String(10 - Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}`,
    complaint: 'Windowed rendering fixture',
  }));
  const app = harness();
  let tree = app.render({requests});
  let list = byLabel(tree, 'BD balance breakdowns, longest standing first');
  assert.equal(descendants(list, node => node.type === 'li').length, 24);
  const more = descendants(tree, node => node.props.className === 'pulse-load-more')[0];
  assert.equal(text(more), 'Show 6 more breakdowns');
  more.props.onClick();
  tree = app.render({requests});
  list = byLabel(tree, 'BD balance breakdowns, longest standing first');
  assert.equal(descendants(list, node => node.type === 'li').length, 30);
  assert.match(html(tree), /30 of 30 breakdowns/);
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
  // Without a From bound an undated request still counts in the balance until today; a From bound excludes it.
  assert.ok(byLabel(render({requests}), 'BD balance: 1'));
  const bounded = harness();
  byLabel(bounded.render({requests}), 'Info Pulse from date').props.onChange({target: {value: '2026-09-01'}});
  assert.ok(byLabel(bounded.render({requests}), 'BD balance: 0'));
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
  assert.ok(byLabel(tree, 'BD balance: 5'));
  tree = render({requests: [REQUESTS[5], REQUESTS[6]], updatedAt: 0});
  assert.ok(byLabel(tree, 'BD balance: 0') && byLabel(tree, 'Critical: 0'));
  assert.match(html(tree), /No open breakdowns\. BD balance is 0\./);
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

test('each row shows its recorded delay reason under the breakdown reason, and nothing when none exists', () => {
  const rows = descendants(byLabel(allDates().tree, 'BD balance breakdowns, longest standing first'), node => node.type === 'li');
  const [dozer, eicher, drill] = rows.map(html);
  assert.match(dozer, /Breakdown reason LHS track chain loose and battery terminal damage Delay reason Awaiting track chain from supplier 15-09-2026 06:30(:00)? PM IST · Maintenance team/);
  assert.ok(!dozer.includes('Vendor inspection pending'), 'only the latest daily delay reason is shown');
  assert.match(eicher, /Breakdown reason Gear box noise Overdue reason Gear box sent to workshop/);
  assert.ok(!eicher.includes('Spares not in stock'), 'the ETC overdue reason wins over daily updates');
  assert.ok(!drill.includes('Delay reason') && !drill.includes('delay reason'), 'no delay block without a recorded reason');
  assert.equal(descendants(rows[2], node => node.props.className === 'pulse-row-delay').length, 0);
  assert.deepEqual(reasons.pulseDelayReason({delayedReason: 'Waiting for MIS closure'}), {label: 'Closure delay reason', value: 'Waiting for MIS closure', at: ''});
  assert.deepEqual(reasons.pulseDelayReason({dailyRemarks: 'legacy remark text', delayedReason: ''}), null);
  assert.deepEqual(reasons.pulseDelayReason({dailyRemarks: [{remark: 'x', delayReason: '  '}]}), null);
});

test('the filter panel opens collapsed with a purple blinking cue that clears after three seconds', () => {
  const app = harness();
  let tree = app.render();
  const panel = () => descendants(tree, node => node.type === 'details')[0];
  assert.equal(panel().props.open, false, 'collapsed by default on every screen size');
  assert.equal(panel().props.className, 'pulse-filter-panel pulse-filter-hint');
  assert.equal(text(descendants(tree, node => node.props.className === 'pulse-filter-cue')[0]), 'Customise yourself');
  assert.deepEqual(app.timers.map(timer => timer.delay), [3000]);
  app.timers[0].callback();
  tree = app.render();
  assert.equal(panel().props.className, 'pulse-filter-panel');
  assert.equal(descendants(tree, node => node.props.className === 'pulse-filter-cue').length, 0);
  assert.equal(app.timers.length, 1, 'the cue timer is armed once, not on every render');
  panel().props.onToggle({currentTarget: {open: true}});
  tree = app.render();
  assert.equal(panel().props.open, true, 'the user can still expand it');
  const css = readFileSync(new URL('../src/info-pulse-content.css', import.meta.url), 'utf8');
  assert.match(css, /\.pulse-filter-panel\.pulse-filter-hint \{ border: 2px solid var\(--record-purple\); animation: pulse-filter-blink/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.pulse-filter-panel\.pulse-filter-hint, \.pulse-filter-cue \{ animation: none; \} \}/);
});
