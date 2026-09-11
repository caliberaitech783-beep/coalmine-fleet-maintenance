import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformWithOxc} from 'vite';
import * as ledger from '../src/daily-bd-balance.mjs';
import {dashboardCountScale} from '../src/dashboard-count-scale.mjs';
import {recordedBreakdownRangeLength} from '../src/dashboard-breakdown-forecast.mjs';
import {recordBelongsToSite} from '../site-location.mjs';
import {formatDisplayDate} from '../date-time-format.mjs';

const source = readFileSync(new URL('../src/daily-bd-balance-chart.jsx', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export default function', 'function');
const {code} = await transformWithOxc(source, 'daily-bd-balance-chart.jsx', {jsx: {runtime: 'classic'}});
const find = (tree, predicate) => {
  const found = [];
  const visit = node => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!React.isValidElement(node)) return;
    if (predicate(node)) found.push(node);
    visit(node.props.children);
  };
  visit(tree); return found;
};
const label = (tree, value) => find(tree, node => node.props['aria-label'] === value)[0];
const text = node => Array.isArray(node) ? node.map(text).join('') : React.isValidElement(node) ? text(node.props.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
const button = (tree, value) => find(tree, node => node.type === 'button' && text(node) === value)[0];
function harness() {
  const slots = [], calls = []; let cursor = 0;
  const bindings = {
    React, ...ledger, dashboardCountScale, recordedBreakdownRangeLength, recordBelongsToSite, formatDisplayDate,
    useMemo: fn => fn(),
    useState(initial) {const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => {slots[i] = value;}];},
    ...Object.fromEntries(['ArrowDown', 'ArrowRight', 'ArrowUp', 'Info', 'MapPin', 'RotateCcw'].map(name => [name, () => null])),
  };
  const Chart = new Function(...Object.keys(bindings), `${code}; return DailyBdBalanceChart;`)(...Object.values(bindings));
  const props = {today: '2026-09-11', sites: ['Sasti OB', 'Majri OB'], records: [
    {ref: 'OLD', site: 'Sasti OB', start: '2026-09-01', status: 'Open'},
    {ref: 'NEW', site: 'Sasti OB', start: '2026-09-10', status: 'Closed', closedAt: '2026-09-11'},
    {ref: 'MAJRI', site: 'Majri OB', start: '2026-09-11', status: 'Open'},
  ], onInspect: (...args) => calls.push(args)};
  return {calls, render(overrides = {}) {cursor = 0; return Chart({...props, ...overrides});}};
}

test('today is selected and applied by default to all counts and exact date drill-down', () => {
  const view = harness(), tree = view.render();
  assert.equal(label(tree, 'Daily BD balance site').props.value, '');
  assert.equal(label(tree, 'Daily BD balance from date').props.value, '2026-09-11');
  assert.equal(label(tree, 'Daily BD balance to date').props.value, '2026-09-11');
  assert.equal(button(tree, 'Today').props['aria-pressed'], true);
  for (const preset of ['7D', '14D', '30D']) assert.equal(button(tree, preset).props['aria-pressed'], false);
  assert.equal(find(tree, node => node.props.className?.startsWith('bd-balance-day ') || node.props.className === 'bd-balance-day').length, 1);
  for (const metric of ['Opening BD: 2', 'BD In: 1', 'BD Out: 1', 'Closing balance: 2']) assert.ok(label(tree, `${metric} requests in selected period`), metric);
  const bar = label(tree, '11-09-2026: BD Out, 1 requests');
  assert.equal(text(bar), '1');
  bar.props.onClick();
  assert.deepEqual(view.calls.pop(), ['outgoing', '2026-09-11', '2026-09-11', '']);
  label(tree, 'Opening BD: 2 requests in selected period').props.onClick();
  assert.deepEqual(view.calls.pop(), ['open', '2026-09-11', '2026-09-11', '']);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /0.0%/);
  assert.match(html, /bd-balance-change steady/);
});

test('each day plots only In and Out; opening and closing counts remain clickable and carried forward', () => {
  const view = harness();
  button(view.render(), '7D').props.onClick();
  const tree = view.render();
  const days = find(tree, node => node.props.className?.startsWith('bd-balance-day ') || node.props.className === 'bd-balance-day');
  for (const day of days) {
    const bars = find(day, node => node.props.className?.startsWith('bd-balance-bar-button '));
    assert.deepEqual(bars.map(node => node.props.className), ['bd-balance-bar-button incoming', 'bd-balance-bar-button outgoing']);
    assert.ok(find(day, node => node.props.className === 'bd-balance-opening').length);
    assert.ok(find(day, node => node.props.className?.startsWith('bd-balance-closing ')).length);
  }
  label(tree, '10-09-2026: Closing balance, 2 requests').props.onClick();
  assert.deepEqual(view.calls.pop(), ['balance', '2026-09-10', '2026-09-10', '']);
  label(tree, '11-09-2026: Opening BD, 2 requests').props.onClick();
  assert.deepEqual(view.calls.pop(), ['open', '2026-09-11', '2026-09-11', '']);
  assert.match(text(label(tree, '11-09-2026: Closing balance, 2 requests')), /Balance now/);
  assert.match(text(tree), /Net change \+1 open/);
});

test('large opening balances do not shrink the In and Out plot; all dates share the same scale', () => {
  const view = harness();
  button(view.render(), '7D').props.onClick();
  const records = [...Array.from({length: 1000}, (_, i) => ({ref: `OLD-${i}`, start: '2026-08-01'})), {ref: 'NEW', start: '2026-09-10', closedAt: '2026-09-11'}];
  const tree = view.render({records});
  const barHeight = node => find(node, item => item.props.className === 'bd-balance-bar')[0].props.style.height;
  assert.equal(barHeight(label(tree, '10-09-2026: BD In, 1 requests')), '100%');
  assert.equal(barHeight(label(tree, '11-09-2026: BD Out, 1 requests')), '100%');
  assert.equal(barHeight(label(tree, '11-09-2026: BD In, 0 requests')), '0%');
});

test('site, period and date filters keep totals and drill-down in sync', () => {
  const view = harness(); let tree = view.render();
  label(tree, 'Daily BD balance site').props.onChange({target: {value: 'Sasti OB'}});
  tree = view.render();
  assert.ok(label(tree, 'Closing balance: 1 requests in selected period'));
  assert.match(renderToStaticMarkup(tree), /-50.0%/);
  button(tree, '14D').props.onClick();
  tree = view.render();
  assert.equal(label(tree, 'Daily BD balance from date').props.value, '2026-08-29');
  label(tree, 'BD In: 2 requests in selected period').props.onClick();
  assert.deepEqual(view.calls.pop(), ['incoming', '2026-08-29', '2026-09-11', 'Sasti OB']);
  label(tree, 'Daily BD balance from date').props.onChange({target: {value: '2026-09-10'}});
  tree = view.render();
  assert.ok(label(tree, 'Opening BD: 1 requests in selected period'));
  assert.ok(label(tree, 'BD In: 1 requests in selected period'));
  label(tree, 'Daily BD balance to date').props.onChange({target: {value: '2026-09-09'}});
  tree = view.render();
  assert.equal(label(tree, 'Daily BD balance from date').props.value, '2026-09-09');
  label(tree, 'Daily BD balance to date').props.onChange({target: {value: '2030-01-01'}});
  tree = view.render();
  assert.match(text(tree), /Choose valid dates/);
  assert.equal(label(tree, 'Daily BD balance to date').props.value, '2026-09-09');
  button(tree, '30D').props.onClick();
  tree = view.render();
  assert.equal(label(tree, 'Daily BD balance from date').props.value, '2026-08-13');
  assert.doesNotMatch(text(tree), /Choose valid dates/);
  tree = view.render({sites: ['Majri OB']});
  assert.equal(label(tree, 'Daily BD balance site').props.value, '', 'removed site selection cannot persist across region changes');
});

test('loading, retry, stale and unknown-date states do not silently fabricate counts', () => {
  const view = harness(); let retries = 0;
  let tree = view.render({ready: false});
  assert.match(text(tree), /Loading BD movement/);
  assert.equal(label(tree, 'BD movement totals for selected period'), undefined);
  tree = view.render({ready: false, error: 'offline', onRefresh: () => retries++});
  button(tree, ' Retry').props.onClick();
  assert.equal(retries, 1);
  tree = view.render({stale: true});
  assert.match(text(tree), /Last checked data/);
  assert.doesNotMatch(text(tree), /Today · live/);
  tree = view.render({records: [{ref: 'BAD', status: 'Closed', start: '2026-09-01'}]});
  button(tree, '1 requests excluded: start or closing dates need correction. View requests').props.onClick();
  assert.deepEqual(view.calls.pop(), ['undated', '2026-09-11', '2026-09-11', '']);
  tree = view.render({records: [{ref: 'NEW', start: '2026-09-11', status: 'Open'}]});
  const html = renderToStaticMarkup(tree);
  assert.match(html, /\+1 from 0/);
  assert.doesNotMatch(html, /Infinity|NaN/);
});

test('Today follows the current day, custom dates persist, and clearing dates restores today', () => {
  const view = harness();
  let tree = view.render();
  tree = view.render({today: '2026-09-12'});
  assert.equal(label(tree, 'Daily BD balance from date').props.value, '2026-09-12');
  assert.equal(label(tree, 'Daily BD balance to date').props.value, '2026-09-12');
  button(tree, '7D').props.onClick();
  tree = view.render({today: '2026-09-12'});
  assert.equal(label(tree, 'Daily BD balance from date').props.value, '2026-09-06');
  label(tree, 'Daily BD balance from date').props.onChange({target: {value: '2026-09-09'}});
  tree = view.render({today: '2026-09-13'});
  assert.equal(label(tree, 'Daily BD balance from date').props.value, '2026-09-09');
  assert.equal(label(tree, 'Daily BD balance to date').props.value, '2026-09-12');
  assert.equal(button(tree, 'Today').props['aria-pressed'], false);
  button(tree, 'Today').props.onClick();
  tree = view.render({today: '2026-09-13'});
  assert.equal(label(tree, 'Daily BD balance from date').props.value, '2026-09-13');
  assert.equal(label(tree, 'Daily BD balance to date').props.value, '2026-09-13');
  button(tree, '30D').props.onClick();
  tree = view.render({today: '2026-09-13'});
  label(tree, 'Daily BD balance to date').props.onChange({target: {value: ''}});
  tree = view.render({today: '2026-09-13'});
  assert.equal(label(tree, 'Daily BD balance from date').props.value, '2026-09-13');
  assert.equal(label(tree, 'Daily BD balance to date').props.value, '2026-09-13');
  assert.equal(button(tree, 'Today').props['aria-pressed'], true);
});
