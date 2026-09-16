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
const REQUESTS = [
  {ref: 'REQ-V167', door: 'V167', reg: 'MH34BZ3284', site: 'Dhoptala OB (2nd)', equipmentGroup: 'VOLVO TIPPERS', status: 'Open', start: '2026-09-16 06:02', expectedCompletionAt: '2026-09-16 06:20', complaint: 'RHS 2nd axle main leaf spring broken'},
  {ref: 'REQ-S145', door: 'S145', site: 'Sasti OB', equipmentGroup: 'SCANIA TIPPERS', status: 'Open', start: '2026-09-16 09:36', expectedCompletionAt: '2026-09-16 13:00', complaint: 'Third axle oil seal leakage'},
  {ref: 'REQ-D38', door: 'D38', site: 'Majri OB', equipmentGroup: 'DOZERS', status: 'Open', start: '2026-09-14 08:01', complaint: 'LHS track chain loose and battery terminal damage'},
  {ref: 'REQ-W1', door: 'W1', site: 'Majri OB', equipmentGroup: 'EICHER TIPPERS', status: 'Open', start: '2026-09-15 20:00', complaint: 'Gear box noise'},
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
    ...Object.fromEntries(['RefreshCw', 'MapPin', 'Truck', 'AlertTriangle', 'Activity', 'Clock'].map(name => [name, () => null])),
  };
  const Component = new Function(...Object.keys(bindings), `${code}; return InfoPulseContent;`)(...Object.values(bindings));
  return {render(overrides = {}) {
    cursor = 0;
    const requests = overrides.requests || REQUESTS;
    return Component({breakdowns: data.buildInfoPulseBreakdowns(requests), scope: {label: 'All regions'}, now: NOW, updatedAt: NOW, ready: true, error: '', refreshing: false, onRefresh() {}, ...overrides});
  }};
}
const render = overrides => harness().render(overrides);

test('BD balance is the selected KPI by default and lists every open breakdown longest standing first with its reason', () => {
  const tree = render();
  const balance = byLabel(tree, 'BD balance: 4');
  assert.equal(balance.props['aria-pressed'], true);
  assert.equal(text(balance), 'BD balance4Every open breakdown, excluding idle, closed and verified requests.');
  assert.equal(byLabel(tree, 'Critical: 1').props['aria-pressed'], false);
  assert.ok(byLabel(tree, 'Warning: 1') && byLabel(tree, 'Open: 2'));
  const list = byLabel(tree, 'BD balance breakdowns, longest standing first');
  assert.equal(list.type, 'ol');
  assert.deepEqual(vehicles(list), ['D38', 'W1', 'V167', 'S145']);
  assert.deepEqual(descendants(list, node => node.props.className === 'pulse-rank').map(text), ['1', '2', '3', '4']);
  const body = html(list);
  for (const reason of ['LHS track chain loose and battery terminal damage', 'Gear box noise', 'RHS 2nd axle main leaf spring broken', 'Third axle oil seal leakage']) assert.ok(body.includes(reason), reason);
  assert.ok(body.includes('Majri OB') && body.includes('DOZERS · REQ-D38') && body.includes('VOLVO TIPPERS · REQ-V167'));
  for (const excluded of ['E110', 'S55', 'S6', 'No operator', 'Brake liner']) assert.ok(!body.includes(excluded), `${excluded} excluded`);
  assert.match(html(tree), /4 of 4 breakdowns/);
});

test('rows are tinted by standing time: critical from 24 hours, warning from 12 hours, open below that', () => {
  const rows = descendants(byLabel(render(), 'BD balance breakdowns, longest standing first'), node => node.type === 'li');
  assert.deepEqual(rows.map(row => row.props.className), ['pulse-breakdown-row critical', 'pulse-breakdown-row warning', 'pulse-breakdown-row open', 'pulse-breakdown-row open']);
  assert.deepEqual(rows.map(row => text(descendants(row, node => node.props.className?.startsWith('pulse-tier-tag'))[0])), ['Critical · 24h+', 'Warning · 12h+', 'Under 12h', 'Under 12h']);
  const hour = 3_600_000;
  assert.equal(timing.pulseStandingTier(24 * hour), 'critical');
  assert.equal(timing.pulseStandingTier(24 * hour - 1), 'warning');
  assert.equal(timing.pulseStandingTier(12 * hour), 'warning');
  assert.equal(timing.pulseStandingTier(12 * hour - 1), 'open');
  assert.equal(timing.pulseStandingTier(0), 'open');
  const annotated = timing.pulseBreakdownRows(data.buildInfoPulseBreakdowns(REQUESTS), NOW);
  assert.deepEqual(timing.pulseTierCounts(annotated), {all: 4, critical: 1, warning: 1, open: 2});
});

test('clicking a KPI card narrows the list to that tier, renumbers it, and BD balance restores everything', () => {
  const app = harness();
  let tree = app.render();
  byLabel(tree, 'Critical: 1').props.onClick();
  tree = app.render();
  assert.equal(byLabel(tree, 'Critical: 1').props['aria-pressed'], true);
  assert.equal(byLabel(tree, 'BD balance: 4').props['aria-pressed'], false);
  let list = byLabel(tree, 'Critical breakdowns, longest standing first');
  assert.deepEqual(vehicles(list), ['D38']);
  assert.match(html(tree), /Critical Standing in breakdown for 24 hours or more\. 1 of 4 breakdowns/);
  byLabel(tree, 'Warning: 1').props.onClick();
  tree = app.render();
  assert.deepEqual(vehicles(byLabel(tree, 'Warning breakdowns, longest standing first')), ['W1']);
  byLabel(tree, 'Open: 2').props.onClick();
  tree = app.render();
  list = byLabel(tree, 'Open breakdowns, longest standing first');
  assert.deepEqual(vehicles(list), ['V167', 'S145']);
  assert.deepEqual(descendants(list, node => node.props.className === 'pulse-rank').map(text), ['1', '2']);
  assert.match(html(tree), /2 of 4 breakdowns/);
  byLabel(tree, 'BD balance: 4').props.onClick();
  tree = app.render();
  assert.deepEqual(vehicles(byLabel(tree, 'BD balance breakdowns, longest standing first')), ['D38', 'W1', 'V167', 'S145']);
  // A selected tier with no rows says so instead of showing a zero balance.
  byLabel(tree, 'Warning: 1').props.onClick();
  tree = app.render({requests: REQUESTS.filter(request => request.ref !== 'REQ-W1')});
  assert.ok(byLabel(tree, 'Warning: 0'));
  assert.match(html(tree), /No warning breakdowns right now\./);
});

test('the redesign has no site tabs, alert categories, pagination or drill-downs', () => {
  const tree = render();
  assert.equal(descendants(tree, node => 'aria-expanded' in node.props).length, 0);
  assert.deepEqual(descendants(tree, node => node.type === 'button').map(node => node.props['aria-label'] || text(node)), ['Refresh Info Pulse', 'Today', '7D', '14D', '30D', 'BD balance: 4', 'Critical: 1', 'Warning: 1', 'Open: 2']);
  const page = html(tree);
  for (const removed of ['Updates', 'ETC overdue', 'Down ≥ 3 days', 'New ≤ 12 hours', 'All cases', 'Total breakdowns', 'of 4 cases', 'Filter site']) assert.ok(!page.includes(removed), `${removed} removed`);
  assert.ok(!source.includes('PAGE_SIZE') && !source.includes('createPortal'));
});

test('each row shows standing since, down for and the ETC as overdue, due in or not set', () => {
  const rows = descendants(byLabel(render(), 'BD balance breakdowns, longest standing first'), node => node.type === 'li');
  const [dozer, , volvo, scania] = rows.map(html);
  assert.match(dozer, /Standing since 14-09-2026 08:01(:00)? AM Down for 2d 2h 59m ETC Not set/);
  assert.match(volvo, /Standing since 16-09-2026 06:02(:00)? AM Down for 4h 58m ETC 16-09-2026 06:20(:00)? AM Overdue by 4h 40m/);
  assert.match(scania, /Standing since 16-09-2026 09:36(:00)? AM Down for 1h 24m ETC 16-09-2026 01:00(:00)? PM Due in 2h 0m/);
  const annotated = timing.pulseBreakdownRows(data.buildInfoPulseBreakdowns(REQUESTS), NOW);
  assert.equal(annotated[0].share, 1, 'longest standing fills the bar');
  assert.equal(annotated[2].share.toFixed(3), (298 / 3059).toFixed(3));
  assert.equal(annotated[3].share, 0.03, 'short stoppages keep a visible sliver');
  assert.deepEqual(descendants(rows[0], node => node.props.className === 'pulse-standing-bar')[0].props.style, {'--fill': 1});
});

test('missing start, unparseable ETC and missing complaint render explicit placeholders instead of crashing', () => {
  const requests = [{ref: 'REQ-BLANK', site: 'Sasti OB', status: 'Open', expectedCompletionAt: 'soon'}];
  const tree = render({requests});
  const row = html(byLabel(tree, 'BD balance breakdowns, longest standing first'));
  assert.ok(row.includes('Breakdown reason Not recorded'));
  assert.ok(row.includes('Standing since Not recorded Down for Not recorded ETC Not recorded'));
  const [annotated] = timing.pulseBreakdownRows(data.buildInfoPulseBreakdowns(requests), NOW);
  assert.equal(annotated.etcState, 'unknown');
  assert.equal(annotated.tier, 'open');
  assert.ok(byLabel(tree, 'BD balance: 1') && byLabel(tree, 'Open: 1'));
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
  assert.ok(byLabel(tree, 'BD balance: 4'));
  tree = render({requests: [REQUESTS[4], REQUESTS[5]], updatedAt: 0});
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

test('KPI cards sit in one row of four and breakdown rows are tier-tinted single-line cards that stack on narrow screens', () => {
  const css = readFileSync(new URL('../src/info-pulse-content.css', import.meta.url), 'utf8');
  assert.match(css, /\.pulse-kpis \{ display: grid; grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.pulse-kpi\.critical \{ --kpi: #b01c37;/);
  assert.match(css, /\.pulse-kpi\.warning \{ --kpi: #a06400;/);
  assert.match(css, /\.pulse-kpi\.selected \{ border-color: var\(--kpi\); background: var\(--kpi-soft\);/);
  assert.match(css, /\.pulse-breakdown-row \{[^}]*grid-template-columns: 40px minmax\(200px, \.85fr\) minmax\(220px, 1\.5fr\) auto; align-items: center;/);
  assert.match(css, /\.pulse-breakdown-row\.critical \{ --tier: #c8233f;/);
  assert.match(css, /\.pulse-breakdown-row\.warning \{ --tier: #e0a300;/);
  assert.match(css, /\.pulse-standing-bar::after \{[^}]*width: calc\(var\(--fill, 0\) \* 100%\);/);
  assert.match(css, /@media \(max-width: 1000px\) \{[^@]*\.pulse-kpis \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}[^@]*\.pulse-breakdown-row \{ grid-template-columns: 40px 1fr; \}/);
  assert.ok(!css.includes('pulse-heading-total') && !css.includes('pulse-breakdown-total') && !css.includes('pulse-case-card') && !css.includes('pulse-pagination'));
});

const kpi = (tree, label) => Number(text(descendants(byLabel(tree, label), node => node.props.className === 'pulse-kpi-count')[0]));
const kpiCounts = tree => Object.fromEntries(['BD balance', 'Critical', 'Warning', 'Open'].map(label => [label, kpi(tree, descendants(tree, node => String(node.props['aria-label'] || '').startsWith(`${label}: `))[0].props['aria-label'])]));
const selectSite = (app, tree, label) => {
  const option = descendants(byLabel(tree, 'Info Pulse site'), node => node.type === 'option' && text(node) === label)[0];
  byLabel(tree, 'Info Pulse site').props.onChange({target: {value: option.props.value}});
  return app.render();
};

test('the site filter appears only when the scope has several sites and narrows the KPI counts and list', () => {
  const app = harness();
  let tree = app.render();
  assert.deepEqual(descendants(byLabel(tree, 'Info Pulse site'), node => node.type === 'option').map(text), ['All sites', 'Dhoptala OB (2nd)', 'Majri OB', 'Sasti OB']);
  assert.match(html(tree), /All sites · All request dates/);
  tree = selectSite(app, tree, 'Majri OB');
  assert.deepEqual(kpiCounts(tree), {'BD balance': 2, Critical: 1, Warning: 1, Open: 0});
  assert.deepEqual(vehicles(byLabel(tree, 'BD balance breakdowns, longest standing first')), ['D38', 'W1']);
  assert.match(html(tree), /Every open breakdown in Majri OB/);
  assert.match(html(tree), /2 of 2 breakdowns · Majri OB · All request dates/);
  byLabel(tree, 'Open: 0').props.onClick();
  tree = app.render();
  assert.match(html(tree), /No breakdowns match these filters\./);
  descendants(tree, node => node.props.className === 'pulse-reset')[0].props.onClick();
  tree = app.render();
  assert.equal(byLabel(tree, 'Info Pulse site').props.value, '');
  assert.deepEqual(vehicles(byLabel(tree, 'Open breakdowns, longest standing first')), ['V167', 'S145']);
  // A single-site user gets no site selector, only the date filters.
  const single = REQUESTS.filter(request => request.site === 'Sasti OB');
  tree = harness().render({requests: single, scope: {label: 'Sasti OB', sites: ['Sasti OB']}});
  assert.equal(byLabel(tree, 'Info Pulse site'), undefined);
  assert.ok(byLabel(tree, 'Info Pulse from date') && byLabel(tree, 'Info Pulse to date'));
  assert.ok(!html(tree).includes('All sites ·'));
});

test('request-date filters are inclusive IST days with presets, reset and an invalid-range message', () => {
  const app = harness();
  let tree = app.render();
  assert.equal(descendants(tree, node => node.props.className === 'pulse-reset').length, 0);
  byLabel(tree, 'Info Pulse from date').props.onChange({target: {value: '2026-09-15'}});
  tree = app.render();
  assert.deepEqual(kpiCounts(tree), {'BD balance': 3, Critical: 0, Warning: 1, Open: 2});
  assert.deepEqual(vehicles(byLabel(tree, 'BD balance breakdowns, longest standing first')), ['W1', 'V167', 'S145']);
  assert.match(html(tree), /3 of 3 breakdowns · All sites · 15-09-2026 – Latest/);
  byLabel(tree, 'Info Pulse to date').props.onChange({target: {value: '2026-09-15'}});
  tree = app.render();
  assert.deepEqual(vehicles(byLabel(tree, 'BD balance breakdowns, longest standing first')), ['W1']);
  assert.equal(byLabel(tree, 'Info Pulse from date').props.max, '2026-09-15');
  assert.equal(byLabel(tree, 'Info Pulse to date').props.min, '2026-09-15');
  const period = label => descendants(byLabel(tree, 'Info Pulse period'), node => text(node) === label)[0];
  period('Today').props.onClick();
  tree = app.render();
  assert.deepEqual([byLabel(tree, 'Info Pulse from date').props.value, byLabel(tree, 'Info Pulse to date').props.value], ['2026-09-16', '2026-09-16']);
  assert.equal(period('Today').props['aria-pressed'], true);
  assert.deepEqual(vehicles(byLabel(tree, 'BD balance breakdowns, longest standing first')), ['V167', 'S145']);
  period('7D').props.onClick();
  tree = app.render();
  assert.deepEqual([byLabel(tree, 'Info Pulse from date').props.value, byLabel(tree, 'Info Pulse to date').props.value], ['2026-09-10', '2026-09-16']);
  assert.equal(period('7D').props['aria-pressed'], true);
  assert.equal(period('Today').props['aria-pressed'], false);
  assert.deepEqual(kpiCounts(tree), {'BD balance': 4, Critical: 1, Warning: 1, Open: 2});
  descendants(tree, node => node.props.className === 'pulse-reset')[0].props.onClick();
  tree = app.render();
  assert.ok(descendants(tree, node => node.type === 'input').every(input => input.props.value === ''));
  assert.equal(descendants(tree, node => node.props.className === 'pulse-reset').length, 0);
  byLabel(tree, 'Info Pulse from date').props.onChange({target: {value: '2026-09-16'}});
  byLabel(tree, 'Info Pulse to date').props.onChange({target: {value: '2026-09-15'}});
  tree = app.render();
  assert.match(text(descendants(tree, node => node.props.role === 'alert')[0]), /From date must be on or before To date\./);
  assert.equal(descendants(tree, node => node.type === 'ol').length, 0);
  assert.deepEqual(kpiCounts(tree), {'BD balance': 0, Critical: 0, Warning: 0, Open: 0});
});
