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
import {dailyBdBalanceExport} from '../src/dashboard-section-export.mjs';
import DateInput from '../src/date-input.mjs';
import {timestampMatchesShift} from '../shift-report-time.mjs';

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
function harness(simple=false) {
  const slots = [], calls = []; let cursor = 0;
  const bindings = {
    useSimpleMobile:()=>simple,
    React, ...ledger, dashboardCountScale, recordedBreakdownRangeLength, recordBelongsToSite, formatDisplayDate, dailyBdBalanceExport, timestampMatchesShift,
    useMemo: fn => fn(),
    useState(initial) {const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => {slots[i] = value;}];},
    ...Object.fromEntries(['ArrowDown', 'ArrowRight', 'ArrowUp', 'Info', 'MapPin', 'RotateCcw'].map(name => [name, () => null])),
};
  const Chart = new Function("DateInput", ...Object.keys(bindings), `${code}; return DailyBdBalanceChart;`)(DateInput, ...Object.values(bindings));
  const props = {today: '2026-09-11', sites: ['Sasti OB', 'Majri OB'], records: [
    {ref: 'OLD', site: 'Sasti OB', start: '2026-09-01', status: 'Open'},
    {ref: 'NEW', site: 'Sasti OB', start: '2026-09-10', status: 'Closed', closedAt: '2026-09-11'},
    {ref: 'MAJRI', site: 'Majri OB', start: '2026-09-11', status: 'Open'},
  ], onInspect: (...args) => calls.push(args)};
  return {calls, render(overrides = {}) {cursor = 0; return Chart({...props, ...overrides});}};
}

test('mobile BD table keeps daily counts and detail clicks without plotting bars',()=>{
  const view=harness(true),tree=view.render();
  assert.ok(find(tree,node=>node.type==='table').length);
  assert.equal(find(tree,node=>node.props.className==='bd-site-graphs').length,0);
  const count=find(tree,node=>node.type==='button'&&node.props['aria-label']?.includes('2026-09-11, Closing'))[0];
  assert.ok(count,'Closing balance remains a detail button');
  count.props.onClick();
  assert.equal(view.calls[0][0],'active-balance');
  assert.deepEqual(view.calls[0].slice(1,3),['2026-09-11','2026-09-11']);
});

test('today is selected and applied by default to all counts and exact date drill-down', () => {
  const view = harness(), tree = view.render();
  assert.equal(label(tree, 'Daily BD balance site').props.value, '');
  assert.equal(label(tree, 'Daily BD balance from date').props.value, '2026-09-11');
  assert.equal(label(tree, 'Daily BD balance to date').props.value, '2026-09-11');
  assert.equal(button(tree, 'Today').props['aria-pressed'], true);
  for (const preset of ['7D', '14D', '30D']) assert.equal(button(tree, preset).props['aria-pressed'], false);
  assert.equal(find(tree, node => node.props.className?.startsWith('bd-balance-day ') || node.props.className === 'bd-balance-day').length, 1);
  for (const metric of ['Opening BD: 2', 'BD In: 1', 'BD Out: 1', 'Closing balance: 2']) assert.ok(label(tree, `${metric} requests in selected period`), metric);
  const bar = label(tree, '11-09-26: BD Out, 1 requests');
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
  label(tree, '10-09-26: Closing balance, 2 requests').props.onClick();
  assert.deepEqual(view.calls.pop(), ['active-balance', '2026-09-10', '2026-09-10', '']);
  label(tree, '11-09-26: Opening BD, 2 requests').props.onClick();
  assert.deepEqual(view.calls.pop(), ['open', '2026-09-11', '2026-09-11', '']);
  assert.match(text(label(tree, '11-09-26: Closing balance, 2 requests')), /Balance now/);
  assert.match(text(tree), /Net change \+1 open/);
});

test('large opening balances do not shrink the In and Out plot; all dates share the same scale', () => {
  const view = harness();
  button(view.render(), '7D').props.onClick();
  const records = [...Array.from({length: 1000}, (_, i) => ({ref: `OLD-${i}`, start: '2026-08-01'})), {ref: 'NEW', start: '2026-09-10', closedAt: '2026-09-11'}];
  const tree = view.render({records});
  const barHeight = node => find(node, item => item.props.className === 'bd-balance-bar')[0].props.style.height;
  assert.equal(barHeight(label(tree, '10-09-26: BD In, 1 requests')), '100%');
  assert.equal(barHeight(label(tree, '11-09-26: BD Out, 1 requests')), '100%');
  assert.equal(barHeight(label(tree, '11-09-26: BD In, 0 requests')), '0%');
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

test('an Export menu beside the period buttons exports the days and totals on screen, following the site and range', () => {
  const ExportMenu = () => null;
  const menuOf = tree => find(tree, node => node.type === ExportMenu)[0];
  const cells = menu => menu.props.rows.map(row => menu.props.columns.map(column => column.value(row)));
  const view = harness();
  assert.equal(menuOf(view.render()), undefined, 'nothing without the shared menu');
  assert.equal(menuOf(view.render({ExportMenu, ready: false})), undefined, 'nothing while loading');
  let menu = menuOf(view.render({ExportMenu}));
  assert.equal(menu.props.className, 'mine-section-export');
  assert.equal(menu.props.title, 'Daily BD balance · All regions · 11-09-26 to 11-09-26 · Today so far');
  assert.deepEqual(cells(menu), [['11-09-26', 'Today · live', 2, 1, 1, 2, 0, '0', '0.0%']]);
  button(view.render({ExportMenu}), '7D').props.onClick();
  menu = menuOf(view.render({ExportMenu}));
  assert.equal(menu.props.title, 'Daily BD balance · All regions · 05-09-26 to 11-09-26 · Today so far');
  assert.equal(menu.props.rows.length, 8, 'seven days and the selected period');
  assert.deepEqual(cells(menu).at(-1), ['Selected period', '05-09-26 to 11-09-26', 1, 2, 1, 2, 0, '+1', '+100.0%']);
  label(view.render({ExportMenu}), 'Daily BD balance site').props.onChange({target: {value: 'Majri OB'}});
  assert.match(menuOf(view.render({ExportMenu})).props.title, /^Daily BD balance · Majri OB · 05-09-26 to 11-09-26/);
});

test('the Export menu prints the chart as it is on screen and hands its table to the dashboard workbook', () => {
  const ExportMenu = () => null;
  const exportRef = {current: 'untouched'};
  const view = harness();
  const menu = find(view.render({ExportMenu, exportRef}), node => node.type === ExportMenu)[0];
  assert.equal(menu.props.printSection, true, 'Smart Print captures the section, not a table');
  assert.equal(exportRef.current.title, menu.props.title);
  assert.deepEqual(exportRef.current.rows, menu.props.rows);
  view.render({ExportMenu, exportRef, ready: false});
  assert.equal(exportRef.current, null, 'nothing to export while loading');
});

test('every site view compares dates, includes zero sites, and drills into the exact site and date', () => {
  const view = harness();
  label(view.render(), 'Daily BD balance view').props.onChange({target: {value: 'sites'}});
  label(view.render(), 'Daily BD balance from date').props.onChange({target: {value: '2026-09-10'}});
  let tree = view.render({sites: ['Sasti OB', 'Majri OB', 'Empty site']});
  assert.ok(label(tree, 'Every site BD balance by date'));
  assert.equal(find(tree, node => node.type === 'table').length, 0);
  assert.equal(find(tree, node => node.props.className === 'bd-site-card').length, 3);
  const barHeight = name => find(label(tree, name), node => node.props.className === 'bd-site-bar-fill')[0].props.style.height;
  assert.equal(barHeight('Sasti OB, 10-09-26: Closing BD, 2 requests'), '100%');
  assert.equal(barHeight('Majri OB, 11-09-26: Closing BD, 1 requests'), '50%');
  assert.equal(barHeight('Empty site, 11-09-26: Closing BD, 0 requests'), '0%');
  label(tree, 'Empty site, 11-09-26: Closing BD, 0 requests').props.onClick();
  assert.deepEqual(view.calls.pop(), ['active-balance', '2026-09-11', '2026-09-11', 'Empty site']);
  assert.doesNotMatch(renderToStaticMarkup(tree), /NaN|Infinity/);
  assert.ok(label(tree, 'Sasti OB, 10-09-26: Closing BD, 2 requests'));
  assert.ok(label(tree, 'Sasti OB, 11-09-26: Closing BD, 1 requests'));
  assert.ok(label(tree, 'Majri OB, 10-09-26: Closing BD, 0 requests'));
  assert.ok(label(tree, 'Empty site, 11-09-26: Closing BD, 0 requests'));
  label(tree, 'Sasti OB, 10-09-26: Closing BD, 2 requests').props.onClick();
  assert.deepEqual(view.calls.pop(), ['active-balance', '2026-09-10', '2026-09-10', 'Sasti OB']);
  label(tree, 'Sasti OB: BD Out, 1 requests in selected period').props.onClick();
  assert.deepEqual(view.calls.pop(), ['outgoing', '2026-09-10', '2026-09-11', 'Sasti OB']);
  label(tree, 'Daily BD balance site').props.onChange({target: {value: 'Majri OB'}});
  tree = view.render();
  assert.equal(label(tree, 'Sasti OB, 11-09-26: Closing BD, 1 requests'), undefined);
  assert.ok(label(tree, 'Majri OB, 11-09-26: Closing BD, 1 requests'));
  tree = view.render({sites: ['Sasti OB']});
  assert.equal(label(tree, 'Daily BD balance site').props.value, '');
  assert.equal(label(tree, 'Majri OB, 11-09-26: Closing BD, 1 requests'), undefined);
  assert.equal(label(view.render({ready: false}), 'Every site BD balance by date'), undefined);
});

test('every site export includes daily movements and period totals with idle kept separate', () => {
  const view = harness(), exportRef = {};
  label(view.render(), 'Daily BD balance view').props.onChange({target: {value: 'sites'}});
  label(view.render(), 'Daily BD balance from date').props.onChange({target: {value: '2026-09-10'}});
  const tree = view.render({exportRef, records: [
    {ref: 'OPEN', site: 'Sasti', start: '2026-09-09', status: 'Open'},
    {ref: 'IDLE', site: 'Sasti', start: '2026-09-09', status: 'Idle'},
    {ref: 'CLOSED', site: 'Majri OB', start: '2026-09-10', closedAt: '2026-09-11', status: 'Closed'},
  ]});
  assert.ok(label(tree, 'Sasti OB, 11-09-26: Closing BD, 1 requests'));
  assert.ok(label(tree, 'Sasti OB: Idle Vehicles, 1 requests in selected period'));
  const exported = exportRef.current;
  assert.match(exported.title, /^Every site BD balance/);
  assert.equal(exported.columns[0].label, 'Site name');
  assert.equal(exported.rows.length, 6);
  assert.deepEqual(exported.rows.filter(row => row.label === 'Selected period').map(row => [row.site, row.open, row.incoming, row.outgoing, row.balance, row.idle]), [
    ['Sasti OB', 2, 0, 0, 1, 1], ['Majri OB', 0, 1, 1, 0, 0],
  ]);
  label(tree, 'Daily BD balance view').props.onChange({target: {value: 'chart'}});
  view.render({exportRef});
  assert.equal(exportRef.current.columns[0].label, 'Date');
});

test('every site view applies Shift Master to each site ledger', () => {
  const view = harness();
  label(view.render(), 'Daily BD balance view').props.onChange({target: {value: 'sites'}});
  const tree = view.render({shift: 'A', shiftOptions: [{key: 'A', label: 'A Shift'}], shiftRecords: [
    {site: 'Sasti OB', shiftName: 'Shift A', shiftCode: 'A', startTime: '06:00', endTime: '14:00'},
    {site: 'Majri OB', shiftName: 'Shift A', shiftCode: 'A', startTime: '06:00', endTime: '14:00'},
  ], records: [
    {ref: 'A', site: 'Sasti OB', start: '2026-09-11T08:00:00+05:30'},
    {ref: 'B', site: 'Sasti OB', start: '2026-09-11T16:00:00+05:30'},
    {ref: 'C', site: 'Majri OB', start: '2026-09-11T09:00:00+05:30'},
  ]});
  assert.ok(label(tree, 'Sasti OB: BD In, 1 requests in selected period'));
  assert.ok(label(tree, 'Majri OB: BD In, 1 requests in selected period'));
});
