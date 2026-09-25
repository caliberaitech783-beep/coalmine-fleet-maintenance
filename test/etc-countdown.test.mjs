import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformWithOxc} from 'vite';
import {parseIstTimestamp as at} from '../ai-feeder.mjs';
import {formatDisplayDateTime} from '../date-time-format.mjs';
import {normalizeEquipmentGroup} from '../equipment-group.mjs';
import * as requestAcceptance from '../request-acceptance.mjs';
import * as equipment from '../request-equipment.mjs';
import {defaultDurationSort} from '../src/duration-sort.mjs';
import {ETC_SOON_MS, etcCountdown, etcDisplayValue, etcRemainingSortValue, etcSortValue, formatEtcDuration} from '../src/etc-countdown.mjs';
import {requestStatusLabel} from '../src/request-status.mjs';
import {dateColumnsFirst, requestColumnsInWorkflowOrder} from '../src/table-actions-model.mjs';
import {dailyUpdatesExportText} from '../src/daily-updates-order.mjs';

const now = at('2026-09-18 14:00:00');
const open = {ref: 'REQ-ETC-1', door: 'LDM6 - 1064', site: 'Sasti OB', status: 'Open', start: '2026-09-18 10:00:00', expectedCompletionAt: '2026-09-18 18:00'};

const componentSource = readFileSync(new URL('../src/etc-countdown.jsx', import.meta.url), 'utf8');
const compiledComponent = await transformWithOxc(componentSource.replace(/^import .*;$/gm, '').replace(/export default /g, '').replace(/export /g, ''), 'etc-countdown.jsx', {jsx: {runtime: 'classic'}});
const {EtcCountdown, subscribeLiveNow, liveNowListenerCount} = new Function('React', 'useState', 'useEffect', 'etcCountdown', `${compiledComponent.code};return {EtcCountdown, subscribeLiveNow, liveNowListenerCount};`)(React, React.useState, React.useEffect, etcCountdown);

test('countdown durations keep every unit down to seconds and stop at minutes for exports', () => {
  assert.equal(formatEtcDuration((3 * 3600 + 59 * 60 + 20) * 1000), '3h 59m 20s');
  assert.equal(formatEtcDuration((3 * 3600 + 59 * 60 + 20) * 1000, {seconds: false}), '3h 59m');
  assert.equal(formatEtcDuration(45_000), '45s');
  assert.equal(formatEtcDuration(45_000, {seconds: false}), 'Under 1 min');
  assert.equal(formatEtcDuration(86_400_000 + 5_000), '1d 0h 0m 5s');
  assert.equal(formatEtcDuration(86_400_000 + 5_000, {seconds: false}), '1d 0h 0m');
  assert.equal(formatEtcDuration(3_600_000), '1h 0m 0s');
  assert.equal(formatEtcDuration(-90_000), '1m 30s');
  assert.equal(formatEtcDuration(0), '0s');
  assert.equal(formatEtcDuration(NaN), '0s');
});

test('a four hour ETC counts down live and turns amber inside the last hour', () => {
  const due = etcCountdown(open, now);
  assert.deepEqual([due.state, due.label, due.summary, due.live, due.remainingMs], ['due', '4h 0m 0s left', '4h 0m left', true, 4 * 3_600_000]);
  assert.equal(etcCountdown(open, now + 1_000).label, '3h 59m 59s left');
  const soon = etcCountdown({...open, expectedCompletionAt: '2026-09-18 14:45'}, now);
  assert.deepEqual([soon.state, soon.label, soon.summary], ['soon', '45m 0s left', '45m left']);
  assert.equal(etcCountdown({...open, expectedCompletionAt: '2026-09-18 15:00'}, now).state, 'soon');
  assert.equal(etcCountdown({...open, expectedCompletionAt: '2026-09-18 15:00'}, now - 1_000).state, 'due');
  assert.equal(ETC_SOON_MS, 3_600_000);
});

test('a passed ETC shows how long the repair is overdue', () => {
  const overdue = etcCountdown({...open, expectedCompletionAt: '2026-09-18 11:50'}, now);
  assert.deepEqual([overdue.state, overdue.label, overdue.summary, overdue.live], ['overdue', 'Overdue by 2h 10m 0s', 'Overdue by 2h 10m', true]);
  assert.equal(overdue.remainingMs, -(2 * 3600 + 10 * 60) * 1000);
  assert.equal(etcCountdown({...open, expectedCompletionAt: '2026-09-18 13:59'}, now + 30_000).label, 'Overdue by 1m 30s');
});

test('legacy same-day AM ETCs count down to the intended PM time', () => {
  const legacy = {status: 'Open', start: '2026-09-15 10:05:00', expectedCompletionAt: '2026-09-15 03:00'};
  assert.equal(etcDisplayValue(legacy), '2026-09-15T09:30:00.000Z');
  assert.equal(formatDisplayDateTime(etcDisplayValue(legacy)), '15-09-2026 03:00:00 PM');
  assert.equal(etcCountdown(legacy, at('2026-09-15 16:08:00')).label, 'Overdue by 1h 8m 0s');
  assert.equal(etcCountdown(legacy, at('2026-09-15 12:00:00')).label, '3h 0m 0s left');
});

test('unset, unreadable, closed, verified and idle requests do not tick', () => {
  assert.deepEqual(etcCountdown({}, now), {etc: NaN, remainingMs: null, live: false, state: 'none', label: 'Not set', summary: '—'});
  assert.deepEqual([etcCountdown({expectedCompletionAt: 'soon'}, now).state, etcCountdown({expectedCompletionAt: 'soon'}, now).label], ['unknown', 'Not readable']);
  assert.equal(etcDisplayValue({expectedCompletionAt: 'soon'}), 'soon');
  const within = etcCountdown({...open, status: 'Closed', closedAt: '2026-09-18 16:00:00'}, now);
  assert.deepEqual([within.state, within.label, within.live, within.remainingMs], ['closed', 'Closed within ETC', false, 2 * 3_600_000]);
  const late = etcCountdown({...open, status: 'Closed', closedAt: '2026-09-18 20:30:00'}, now);
  assert.deepEqual([late.state, late.label, late.summary], ['closed-late', 'Closed 2h 30m after ETC', 'Closed 2h 30m after ETC']);
  assert.deepEqual([etcCountdown({...open, verifiedAt: '2026-09-19 09:00:00'}, now).state, etcCountdown({...open, verifiedAt: '2026-09-19 09:00:00'}, now).label], ['closed', 'Closed']);
  assert.equal(etcCountdown({...open, status: 'closed'}, now).label, 'Closed');
  for (const status of ['Idle', 'Ideal']) assert.deepEqual([etcCountdown({...open, status}, now).state, etcCountdown({...open, status}, now).live], ['idle', false]);
});

test('time-left sorting puts the most overdue first and requests without a live ETC last', () => {
  const rows = [
    {id: 'none', ...open, expectedCompletionAt: ''},
    {id: 'due', ...open},
    {id: 'closed', ...open, status: 'Closed', closedAt: '2026-09-18 12:00:00'},
    {id: 'overdue', ...open, expectedCompletionAt: '2026-09-18 11:00'},
    {id: 'soon', ...open, expectedCompletionAt: '2026-09-18 14:30'},
    {id: 'idle', ...open, status: 'Idle', expectedCompletionAt: '2026-09-18 19:00'},
  ];
  const ordered = [...rows].sort((a, b) => etcRemainingSortValue(a, now) - etcRemainingSortValue(b, now)).map(row => row.id);
  assert.deepEqual(ordered.slice(0, 3), ['overdue', 'soon', 'due']);
  assert.deepEqual(new Set(ordered.slice(3)), new Set(['none', 'closed', 'idle']));
  assert.equal(etcRemainingSortValue(rows[0], now), Number.MAX_SAFE_INTEGER);
  const byEtc = [...rows].sort((a, b) => etcSortValue(a) - etcSortValue(b)).map(row => row.id);
  assert.deepEqual(byEtc, ['overdue', 'soon', 'due', 'closed', 'idle', 'none']);
});

test('the countdown chip carries its state, timer role and the ETC as a tooltip', () => {
  const html = renderToStaticMarkup(React.createElement(EtcCountdown, {request: open, now, etcLabel: '18-09-2026 06:00:00 PM'}));
  assert.equal(html, '<span class="etc-countdown due" data-state="due" role="timer" title="ETC 18-09-2026 06:00:00 PM">4h 0m 0s left</span>');
  assert.match(renderToStaticMarkup(React.createElement(EtcCountdown, {request: {...open, expectedCompletionAt: '2026-09-18 11:50'}, now})), /class="etc-countdown overdue"[^>]*role="timer"[^>]*>Overdue by 2h 10m 0s</);
  const unset = renderToStaticMarkup(React.createElement(EtcCountdown, {request: {...open, expectedCompletionAt: ''}, now}));
  assert.equal(unset, '<span class="etc-countdown none" data-state="none">Not set</span>');
  assert.equal(liveNowListenerCount(), 0);
});

test('every countdown on the page shares one ticker that stops with the last subscriber', (t) => {
  t.mock.timers.enable({apis: ['setInterval']});
  const seen = [];
  const stopFirst = subscribeLiveNow(value => seen.push(['first', value]));
  const stopSecond = subscribeLiveNow(value => seen.push(['second', value]));
  assert.equal(liveNowListenerCount(), 2);
  t.mock.timers.tick(1000);
  assert.deepEqual(seen.map(([name]) => name), ['first', 'second']);
  assert.ok(seen.every(([, value]) => Number.isFinite(value)));
  stopFirst();
  t.mock.timers.tick(1000);
  assert.deepEqual(seen.map(([name]) => name), ['first', 'second', 'second']);
  stopSecond();
  assert.equal(liveNowListenerCount(), 0);
  t.mock.timers.tick(5000);
  assert.equal(seen.length, 3);
});

test('ETC and its countdown follow Days of breakdown in the maintenance lead layout', () => {
  const labels = ['Actions', 'Job reference', 'Door no.', 'Status', 'Started', 'Time left for ETC', 'ETC', 'Days of breakdown', 'Breakdown reason', 'Daily remarks'];
  const columns = labels.map((label, index) => ({label, index, key: label === 'ETC' ? 'etc' : label === 'Time left for ETC' ? 'etcRemaining' : `${index}:${label}`}));
  assert.deepEqual(requestColumnsInWorkflowOrder(columns, true).map(column => column.label), ['Job reference', 'Door no.', 'Status', 'Actions', 'Started', 'ETC', 'Days of breakdown', 'Time left for ETC', 'Breakdown reason', 'Daily remarks']);
  const dated = dateColumnsFirst([{key: 'etcRemaining', label: 'Time left for ETC'}, {key: 'etc', label: 'ETC'}, {key: 'start', label: 'Started'}], false);
  assert.deepEqual(dated.map(column => column.key), ['etc', 'start', 'etcRemaining']);
});

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const tableSource = main.slice(main.indexOf('function MobileWorkflowTable('), main.indexOf('function RequestEditForm('));
const {code: compiledTable} = await transformWithOxc(tableSource, 'workflow-table.jsx', {jsx: {runtime: 'classic'}, target: 'es2022'});
const Null = () => null;
const children = (tree, predicate) => {
  const result = [];
  function visit(node) {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!React.isValidElement(node)) return;
    if (predicate(node)) result.push(node);
    visit(node.props.children);
  }
  visit(tree);
  return result;
};
const text = node => Array.isArray(node) ? node.map(text).join('') : React.isValidElement(node) ? text(node.props.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';

function renderTable(props) {
  const slots = [];
  let cursor = 0;
  const useState = initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  };
  const exports = {};
  const FilterableHeader = ({label}) => React.createElement('th', {}, label);
  const scope = {
    React: {...React, useId: () => 'etc-controls'}, useState, useEffect: () => {}, Date: class extends Date { static now() { return now; } },
    ...equipment, ...requestAcceptance, normalizeEquipmentGroup, requestStatusLabel, defaultDurationSort,
    TranslatedText: ({text: value}) => React.createElement('span', {}, String(value ?? '')),
    Modal: Null, ActionsTable: ({children: rows}) => React.createElement('table', {}, rows),
    FilterableHeader, Status: ({children: label}) => React.createElement('span', {}, label),
    ExportMenu: props => { exports.menu = props; return null; }, PrintButton: props => { exports.print = props; return null; },
    TableParameterFilter: Null, MaintenanceRemarks: Null, MeterFileCell: Null, TripCardCell: Null,
    formatTwelveHourDateTime: formatDisplayDateTime, firstTripTimestamp: row => row.firstTripAt,
    matchesSmartSearch: () => true, tableRowMatchesFilters: () => true, tableFilterText: value => String(value ?? ''),
    sortCollator: new Intl.Collator(), useSortableRows: rows => [rows, {}, () => {}],
    calculateBreakdownDaysUntilClose: () => 0, elapsedLabel: () => '', authToken: 'fixture',
    RequestTimelineButton: ({label}) => React.createElement('b', {}, label),
    EtcCountdown: props => React.createElement(EtcCountdown, {...props, now}),
    etcCountdown, etcDisplayValue, etcRemainingSortValue, etcSortValue, dailyUpdatesExportText,
    WORKFLOW_INITIAL_RENDER_ROWS: 100, WORKFLOW_RENDER_BATCH: 100,
  };
  for (const icon of ['Flag', 'Menu', 'Search', 'ListFilter', 'MapPin', 'Pencil', 'Trash2', 'CheckCircle2', 'MessageCircle', 'ShieldCheck']) scope[icon] = Null;
  const MobileWorkflowTable = new Function(...Object.keys(scope), `${compiledTable};return MobileWorkflowTable;`)(...Object.values(scope));
  const tree = MobileWorkflowTable(props);
  const headers = children(tree, node => node.type === 'th' || node.type === FilterableHeader).map(node => node.type === 'th' ? text(node) : node.props.label);
  return {tree, html: renderToStaticMarkup(tree), exports, headers};
}

test('the maintenance table shows the ETC beside a live countdown, and prints and exports both', () => {
  const overdue = {...open, ref: 'REQ-ETC-2', expectedCompletionAt: '2026-09-18 11:50'};
  const unset = {...open, ref: 'REQ-ETC-3', expectedCompletionAt: ''};
  const {tree, html, exports, headers} = renderTable({rows: [open, overdue, unset], showActions: true, showEtc: true, exportTitle: 'Active Maintenance Requests'});
  const startedIndex = headers.indexOf('Started'), daysIndex = headers.indexOf('Days of breakdown');
  assert.deepEqual(headers.slice(startedIndex, startedIndex + 2), ['Started', 'ETC']);
  assert.deepEqual(headers.slice(daysIndex, daysIndex + 3), ['Days of breakdown', 'Time left for ETC', 'Daily remarks']);
  const cells = ref => children(children(tree, node => node.type === 'tr' && node.key === ref)[0], node => node.type === 'td' && node.props.className === 'etc-cell');
  assert.equal(cells(open.ref).length, 2);
  assert.equal(text(cells(open.ref)[0]), '18-09-2026 06:00:00 PM');
  assert.match(html, /<td class="etc-cell">18-09-2026 06:00:00 PM<\/td>/);
  assert.match(html, /<span class="etc-countdown due" data-state="due" role="timer" title="ETC 18-09-2026 06:00:00 PM">4h 0m 0s left<\/span>/);
  assert.match(html, /<td class="etc-cell">18-09-2026 11:50:00 AM<\/td>/);
  assert.match(html, /<span class="etc-countdown overdue"[^>]*>Overdue by 2h 10m 0s<\/span>/);
  assert.match(html, /<td class="etc-cell">—<\/td>/);
  assert.match(html, /<span class="etc-countdown none" data-state="none">Not set<\/span>/);
  for (const columns of [exports.menu.columns, exports.print.columns]) {
    const etc = columns.find(column => column.key === 'etc'), remaining = columns.find(column => column.key === 'etcRemaining');
    assert.deepEqual([etc.label, remaining.label], ['ETC', 'Time left for ETC']);
    assert.deepEqual([etc.value(open), remaining.value(open)], ['18-09-2026 06:00:00 PM', '4h 0m left']);
    assert.deepEqual([etc.value(overdue), remaining.value(overdue)], ['18-09-2026 11:50:00 AM', 'Overdue by 2h 10m']);
    assert.deepEqual([etc.value(unset), remaining.value(unset)], ['—', '—']);
  }
});

test('every workflow table shows ETC while maintenance can additionally opt into the live countdown', () => {
  const plain = renderTable({rows: [open], showActions: true});
  assert.equal(plain.html.includes('Time left for ETC'), false);
  assert.equal(plain.html.includes('etc-countdown'), false);
  assert.equal(plain.exports.menu.columns.find(column => column.key === 'etc').value(open), '18-09-2026 06:00:00 PM');
  assert.deepEqual(plain.headers.slice(plain.headers.indexOf('Started'), plain.headers.indexOf('Started') + 2), ['Started', 'ETC']);
  const colSpan = props => children(renderTable(props).tree, node => node.type === 'td' && node.props.className === 'empty-state')[0].props.colSpan;
  assert.equal(colSpan({rows: [], showEtc: true}) - colSpan({rows: []}), 1);
});

test('the maintenance request and on-road tables opt into the ETC countdown', () => {
  assert.match(main, /isMaintenance && tab === "requests"[^\n]*<MobileWorkflowTable rows=\{activeRequests\}[^\n]*showAcceptanceStatus showEtc onFlagArrival=/);
  assert.match(main, /isMaintenance && tab === "close"[^\n]*<MobileWorkflowTable[^\n]*showInProgressStatus showEtc onFlagArrival=/);
  assert.doesNotMatch(main, /isMis && tab === "requests"[^\n]*showEtc/);
  assert.match(tableSource, /const startedHeader = \(\) => <>\{workflowHeader\("start", startedLabel\)\}\{workflowHeader\("etc", "ETC"\)\}/);
  assert.match(main, /key === "etc" \? etcSortValue\(row\) : key === "etcRemaining" \? etcRemainingSortValue\(row, now\) : key === "breakdownDays"/);
  assert.match(main, /import EtcCountdown from "\.\/etc-countdown\.jsx";/);
});
