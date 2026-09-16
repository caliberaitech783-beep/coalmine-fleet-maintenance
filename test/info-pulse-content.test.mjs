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
const bindings = {
  React, ...data, ...dates, ...timing, requestStatusLabel, parseIstTimestamp,
  createPortal: (child, target) => React.createElement('div', {'data-portal-target': target}, child),
  ...Object.fromEntries(['RefreshCw', 'MapPin', 'Truck', 'AlertTriangle'].map(name => [name, () => null])),
};
const Component = new Function(...Object.keys(bindings), `${code}; return InfoPulseContent;`)(...Object.values(bindings));
const REQUESTS = [
  {ref: 'REQ-V167', door: 'V167', reg: 'MH34BZ3284', site: 'Dhoptala OB (2nd)', equipmentGroup: 'VOLVO TIPPERS', status: 'Open', start: '2026-09-16 06:02', expectedCompletionAt: '2026-09-16 06:20', complaint: 'RHS 2nd axle main leaf spring broken'},
  {ref: 'REQ-S145', door: 'S145', site: 'Sasti OB', equipmentGroup: 'SCANIA TIPPERS', status: 'Open', start: '2026-09-16 09:36', expectedCompletionAt: '2026-09-16 13:00', complaint: 'Third axle oil seal leakage'},
  {ref: 'REQ-D38', door: 'D38', site: 'Majri OB', equipmentGroup: 'DOZERS', status: 'Open', start: '2026-09-14 08:01', complaint: 'LHS track chain loose and battery terminal damage'},
  {ref: 'REQ-IDLE', door: 'E110', site: 'Majri OB', status: 'Idle', start: '2026-09-10 08:00', complaint: 'No operator'},
  {ref: 'REQ-CLOSED', door: 'S55', site: 'Sasti OB', status: 'Closed', start: '2026-09-09 08:00', closedAt: '2026-09-15 08:00', complaint: 'Brake liner broken'},
  {ref: 'REQ-VERIFIED', door: 'S6', site: 'Sasti OB', status: 'Open', verifiedAt: '2026-09-15 09:00', start: '2026-09-08 08:00', complaint: 'Leaf spring broken'},
];
function render(overrides = {}) {
  const requests = overrides.requests || REQUESTS;
  return Component({breakdowns: data.buildInfoPulseBreakdowns(requests), scope: {label: 'All regions'}, now: NOW, updatedAt: NOW, ready: true, error: '', refreshing: false, onRefresh() {}, ...overrides});
}

test('BD balance counts open breakdowns only and lists them longest standing first with their reasons', () => {
  const tree = render();
  const balance = byLabel(tree, 'BD balance: 3 open breakdowns at All regions');
  assert.ok(balance, 'header balance');
  assert.equal(text(balance), 'BD balance3All regions · open breakdowns, excluding idle');
  const list = byLabel(tree, 'Open breakdowns, longest standing first');
  assert.equal(list.type, 'ol');
  const rows = descendants(list, node => node.type === 'li');
  assert.deepEqual(rows.map(row => text(descendants(row, node => node.props.className === 'pulse-row-vehicle')[0])), ['D38', 'V167', 'S145']);
  assert.deepEqual(rows.map(row => text(descendants(row, node => node.props.className === 'pulse-rank')[0])), ['1', '2', '3']);
  const body = html(list);
  for (const reason of ['LHS track chain loose and battery terminal damage', 'RHS 2nd axle main leaf spring broken', 'Third axle oil seal leakage']) assert.ok(body.includes(reason), reason);
  assert.ok(body.includes('Majri OB') && body.includes('DOZERS · REQ-D38') && body.includes('VOLVO TIPPERS · REQ-V167'));
  for (const excluded of ['E110', 'S55', 'S6', 'No operator', 'Brake liner']) assert.ok(!body.includes(excluded), `${excluded} excluded`);
});

test('the redesign has no filters, categories, pagination or drill-downs', () => {
  const tree = render();
  assert.equal(descendants(tree, node => node.type === 'input' || node.type === 'select').length, 0);
  assert.equal(descendants(tree, node => 'aria-pressed' in node.props || 'aria-expanded' in node.props).length, 0);
  assert.deepEqual(descendants(tree, node => node.type === 'button').map(node => text(node)), ['Refresh']);
  const page = html(tree);
  for (const removed of ['Critical', 'Warnings', 'Updates', 'ETC overdue', 'Down ≥ 3 days', 'New ≤ 12 hours', 'All cases', 'Request date', 'Site ', 'of 3']) assert.ok(!page.includes(removed), `${removed} removed`);
  assert.ok(!source.includes('useState') && !source.includes('PAGE_SIZE'));
});

test('each row shows standing since, down for and the ETC as overdue, due in or not set', () => {
  const rows = descendants(byLabel(render(), 'Open breakdowns, longest standing first'), node => node.type === 'li');
  assert.deepEqual(rows.map(row => row.props.className), ['pulse-breakdown-row none', 'pulse-breakdown-row overdue', 'pulse-breakdown-row due']);
  const [dozer, volvo, scania] = rows.map(html);
  assert.match(dozer, /Standing since 14-09-2026 08:01(:00)? AM Down for 2d 2h 59m ETC Not set/);
  assert.match(volvo, /Standing since 16-09-2026 06:02(:00)? AM Down for 4h 58m ETC 16-09-2026 06:20(:00)? AM Overdue by 4h 40m/);
  assert.match(scania, /Standing since 16-09-2026 09:36(:00)? AM Down for 1h 24m ETC 16-09-2026 01:00(:00)? PM Due in 2h 0m/);
  const annotated = timing.pulseBreakdownRows(data.buildInfoPulseBreakdowns(REQUESTS), NOW);
  assert.equal(annotated[0].share, 1, 'longest standing fills the bar');
  assert.equal(annotated[1].share.toFixed(3), (298 / 3059).toFixed(3));
  assert.equal(annotated[2].share, 0.03, 'short stoppages keep a visible sliver');
  assert.deepEqual(descendants(rows[0], node => node.props.className === 'pulse-standing-bar')[0].props.style, {'--fill': 1});
});

test('missing start, unparseable ETC and missing complaint render explicit placeholders instead of crashing', () => {
  const requests = [{ref: 'REQ-BLANK', site: 'Sasti OB', status: 'Open', expectedCompletionAt: 'soon'}];
  const tree = render({requests});
  const row = html(byLabel(tree, 'Open breakdowns, longest standing first'));
  assert.match(row, /Not recorded Reference not recorded|Not recorded/);
  assert.ok(row.includes('Breakdown reason Not recorded'));
  assert.ok(row.includes('Standing since Not recorded Down for Not recorded ETC Not recorded'));
  assert.equal(timing.pulseBreakdownRows(data.buildInfoPulseBreakdowns(requests), NOW)[0].etcState, 'unknown');
  assert.ok(byLabel(tree, 'BD balance: 1 open breakdowns at All regions'));
});

test('loading, failures and an empty balance never render a misleading count and retry is actionable', () => {
  let refreshes = 0;
  const onRefresh = () => refreshes++;
  let tree = render({ready: false, breakdowns: [], refreshing: true, onRefresh});
  assert.equal(text(byLabel(tree, 'BD balance unavailable')), 'BD balance—Loading…');
  assert.match(html(tree), /Loading breakdowns…/);
  assert.equal(byLabel(tree, 'Open breakdowns, longest standing first'), undefined);
  assert.equal(byLabel(tree, 'Refresh Info Pulse').props.disabled, true);
  tree = render({ready: false, breakdowns: [], error: 'offline', onRefresh});
  assert.equal(text(byLabel(tree, 'BD balance unavailable')), 'BD balance—Could not load');
  const alert = descendants(tree, node => node.props.role === 'alert')[0];
  assert.match(text(alert), /Could not load breakdowns\./);
  descendants(alert, node => node.type === 'button')[0].props.onClick();
  assert.equal(refreshes, 1);
  tree = render({error: 'offline', onRefresh});
  assert.match(text(descendants(tree, node => node.props.role === 'alert')[0]), /Refresh failed\. Showing the last loaded breakdowns\./);
  assert.ok(byLabel(tree, 'BD balance: 3 open breakdowns at All regions'));
  tree = render({requests: [REQUESTS[3], REQUESTS[4]], updatedAt: 0});
  assert.ok(byLabel(tree, 'BD balance: 0 open breakdowns at All regions'));
  assert.match(html(tree), /No open breakdowns\. BD balance is 0\./);
  assert.match(html(tree), /Not refreshed yet/);
});

test('the panel header and trigger badge carry the BD balance instead of alert cases', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  assert.match(main, /<h2 id="ai-feeder-title">Open breakdowns<\/h2>/);
  assert.match(main, /const breakdowns = useMemo\(\(\) => ready \? buildInfoPulseBreakdowns\(requests\) : \[\], \[requests, ready\]\);/);
  assert.match(main, /aria-label=\{`Info Pulse, \$\{ready \? "BD balance " \+ breakdowns\.length : "BD balance unavailable"\}`\}/);
  assert.match(main, /<b className="ai-feeder-trigger-count">\{breakdowns\.length\}<\/b>/);
  assert.match(main, /<InfoPulseContent headerTarget=\{pulseHeaderTarget\} breakdowns=\{breakdowns\} scope=\{scope\} now=\{now\}/);
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

test('breakdown rows are single-line cards: rank, equipment, reason and timing, stacking on narrow screens', () => {
  const css = readFileSync(new URL('../src/info-pulse-content.css', import.meta.url), 'utf8');
  assert.match(css, /\.pulse-breakdown-row \{ display: grid; grid-template-columns: 40px minmax\(200px, \.85fr\) minmax\(220px, 1\.5fr\) auto; align-items: center;/);
  assert.match(css, /\.pulse-row-timing \{ display: flex; flex-wrap: nowrap;/);
  assert.match(css, /\.pulse-standing-bar::after \{[^}]*width: calc\(var\(--fill, 0\) \* 100%\);/);
  assert.match(css, /@media \(max-width: 1000px\) \{[^@]*\.pulse-breakdown-row \{ grid-template-columns: 40px 1fr; \}/);
  assert.ok(!css.includes('pulse-case-card') && !css.includes('pulse-issue') && !css.includes('pulse-site-tabs') && !css.includes('pulse-pagination'));
});
