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
import * as reasons from '../src/info-pulse-reasons.mjs';
import * as timing from '../src/info-pulse-timing.mjs';

const source = readFileSync(new URL('../src/info-pulse-content.jsx', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export default function', 'function');
const {code} = await transformWithOxc(source, 'pulse-content.jsx', {jsx: {runtime: 'classic'}});
const NOW = Date.parse('2026-09-10T12:00:00+05:30');
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
function harness() {
  const slots = [];
  let cursor = 0;
  const bindings = {
    React, ...data, ...dates, ...reasons, ...timing, requestStatusLabel, parseIstTimestamp,
    useState(initial) {const slot = cursor++; if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial; return [slots[slot], next => {slots[slot] = typeof next === 'function' ? next(slots[slot]) : next;}];},
    useMemo: callback => callback(),
    ...Object.fromEntries(['ArrowLeft', 'ChevronDown', 'ChevronLeft', 'ChevronRight', 'RefreshCw', 'MapPin', 'Truck', 'Info'].map(name => [name, () => null])),
  };
  const Component = new Function(...Object.keys(bindings), `${code}; return InfoPulseContent;`)(...Object.values(bindings));
  const requests = Array.from({length: 67}, (_, i) => ({ref: `R-${i}`, door: `D-${i}`, site: i < 60 ? 'Sasti OB' : 'Majri OB', status: 'Open', start: i < 60 ? '2026-09-01 12:00' : '2026-09-02 12:00', expectedCompletionAt: '2026-09-03 12:00', complaint: 'Hydraulic leak'}));
  const props = {requests, cases: data.buildInfoPulseCases(requests, {now: NOW}), role: 'Admin', now: NOW, ready: true, scope: {label: 'All regions'}, updatedAt: NOW};
  return {render(overrides = {}) {cursor = 0; return Component({...props, ...overrides});}};
}

function allDatesHarness() {
  const app = harness();
  descendants(app.render(), node => node.props.className === 'pulse-reset')[0].props.onClick();
  return app;
}

test('opens with today in IST applied to dates, site badges, priority boxes, breakdowns and records', () => {
  // UTC is still September 9; the application day has already changed in IST.
  const now = Date.parse('2026-09-09T19:00:00Z');
  const requests = [
    {ref: 'YESTERDAY', site: 'Sasti OB', status: 'Open', start: '2026-09-09T18:29:59Z', expectedCompletionAt: '2026-09-09 23:59'},
    {ref: 'TODAY-SASTI', site: 'Sasti OB', status: 'Open', start: '2026-09-09T18:30:00Z', expectedCompletionAt: '2026-09-10 00:05'},
    {ref: 'TODAY-MAJRI', site: 'Majri OB', status: 'Idle', start: '2026-09-10 00:15', idleReason: 'No driver'},
    {ref: 'TOMORROW', site: 'Majri OB', status: 'Idle', start: '2026-09-11 00:00'},
  ];
  const props = {now, requests, cases: data.buildInfoPulseCases(requests, {now})};
  const app = harness();
  let tree = app.render(props);
  assert.deepEqual(descendants(tree, node => node.type === 'input').map(input => input.props.value), ['2026-09-10', '2026-09-10']);
  assert.match(text(tree), /10-09-2026 – 10-09-2026/);
  assert.equal(byLabel(tree, 'Filter site: All sites').props['aria-pressed'], true);
  assert.equal(text(byLabel(tree, 'Filter site: All sites')), 'All sites2');
  assert.equal(text(byLabel(tree, 'Filter site: Sasti OB')), 'Sasti OB1');
  assert.equal(text(byLabel(tree, 'Filter site: Majri OB')), 'Majri OB1');
  for (const label of ['All cases: 2 cases', 'Critical: 1 cases', 'Warnings: 1 cases', 'Updates: 0 cases', 'Total breakdowns: 1 at All sites']) assert.ok(byLabel(tree, label), label);
  let records = text(byLabel(tree, 'Matching case records'));
  assert.ok(records.includes('TODAY-SASTI') && records.includes('TODAY-MAJRI'));
  assert.ok(!records.includes('YESTERDAY') && !records.includes('TOMORROW'));
  byLabel(tree, 'Filter site: Sasti OB').props.onClick();
  tree = app.render(props);
  assert.ok(byLabel(tree, 'All cases: 1 cases'));
  byLabel(tree, 'Total breakdowns: 1 at Sasti OB').props.onClick();
  records = text(byLabel(app.render(props), 'Matching case records'));
  assert.ok(records.includes('TODAY-SASTI') && !records.includes('YESTERDAY'));
});

test('custom dates survive refresh, Reset opens all dates, and reopening defaults to the current IST day', () => {
  const app = harness();
  let tree = app.render();
  const inputs = descendants(tree, node => node.type === 'input');
  inputs[0].props.onChange({target: {value: '2026-09-02'}});
  inputs[1].props.onChange({target: {value: '2026-09-02'}});
  tree = app.render({now: NOW + 86_400_000});
  assert.deepEqual(descendants(tree, node => node.type === 'input').map(input => input.props.value), ['2026-09-02', '2026-09-02']);
  assert.ok(byLabel(tree, 'All cases: 7 cases'));
  descendants(tree, node => node.props.className === 'pulse-reset')[0].props.onClick();
  tree = app.render();
  assert.ok(descendants(tree, node => node.type === 'input').every(input => input.props.value === ''));
  assert.ok(byLabel(tree, 'All cases: 67 cases'));
  tree = harness().render({now: NOW + 86_400_000});
  assert.deepEqual(descendants(tree, node => node.type === 'input').map(input => input.props.value), ['2026-09-11', '2026-09-11']);
  assert.equal(byLabel(tree, 'Filter site: All sites').props['aria-pressed'], true);
  assert.ok(byLabel(tree, 'All cases: 0 cases'));
  assert.match(text(tree), /No matching cases/);
});

test('site number opens its exact cases, pages retain all records, and a case reveals details', () => {
  const app = allDatesHarness();
  let tree = app.render();
  byLabel(tree, 'Filter site: Sasti OB').props.onClick();
  byLabel(app.render(), 'Filter issue: ETC overdue').props.onClick();
  tree = app.render();
  assert.match(text(tree), /60 cases/);
  assert.match(text(tree), /1–25 of 60 cases/);
  const first = descendants(tree, node => node.props.className === 'pulse-record-link')[0];
  first.props.onClick();
  tree = app.render();
  assert.match(text(tree), /Hydraulic leak/);
  byLabel(tree, 'Next cases').props.onClick();
  tree = app.render();
  assert.match(text(tree), /26–50 of 60 cases/);
  byLabel(tree, 'Next cases').props.onClick();
  tree = app.render();
  assert.match(text(tree), /51–60 of 60 cases/);
  assert.equal(byLabel(tree, 'Next cases').props.disabled, true);
  assert.equal(descendants(tree, node => node.props.className === 'pulse-record-link').length, 10);
});

test('date and site controls update totals and drill-down together and reset returns all cases', () => {
  const app = allDatesHarness();
  let tree = app.render();
  const inputs = descendants(tree, node => node.type === 'input');
  inputs[0].props.onChange({target: {value: '2026-09-02'}});
  tree = app.render();
  assert.match(text(tree), /7 cases/);
  assert.equal(descendants(tree, node => node.props.className === 'pulse-record-link').length, 7);
  descendants(tree, node => node.props.className === 'pulse-reset')[0].props.onClick();
  tree = app.render();
  assert.equal(text(byLabel(tree, 'Filter issue: All cases')), 'All cases67');
  byLabel(tree, 'Filter site: Sasti OB').props.onClick();
  tree = app.render();
  assert.equal(text(byLabel(tree, 'Filter issue: All cases')), 'All cases60');
  assert.ok(!text(byLabel(tree, 'Matching case records')).includes('Majri OB'));
});

test('loading and failures never render a misleading zero and retry is actionable', () => {
  const app = allDatesHarness();
  let tree = app.render({ready: false, updatedAt: 0});
  assert.match(text(tree), /Loading site counts/);
  assert.equal(descendants(tree, node => node.type === 'table').length, 0);
  let retries = 0;
  tree = app.render({ready: false, error: 'offline', updatedAt: 0, onRefresh: () => {retries++;}});
  assert.match(text(tree), /Counts unavailable/);
  descendants(tree, node => node.type === 'button' && text(node) === 'Retry')[0].props.onClick();
  assert.equal(retries, 1);
  tree = app.render({error: 'offline'});
  assert.match(text(tree), /Showing the last loaded counts/);
  assert.equal(text(byLabel(tree, 'Filter issue: All cases')), 'All cases67');
});

test('real daily-update arrays render all reasons and dated history without crashing', () => {
  const request = {ref: 'R-REASONS', door: 'E02-123', site: 'Sasti OB', status: 'Open', start: '2026-09-01 12:00', expectedCompletionAt: '2026-09-05 12:00', complaint: 'Hydraulic leak', idleReason: 'No driver', delayedReason: 'Seal unavailable', arrivalFlagRemark: 'Recovery truck delayed', misFlagRemark: 'First trip incomplete', maintenanceWork: 'Pump replaced', dailyRemarks: [
    {createdAt: '2026-09-09 12:30', authorName: 'Workshop team', remark: 'Pump tested', delayReason: 'Awaiting seal delivery'},
    {createdAt: '2026-09-08 10:00', authorName: 'Site team', remark: 'Pump removed', delayReason: 'Vendor inspection'},
  ]};
  const props = {requests: [request], cases: data.buildInfoPulseCases([request], {now: NOW})};
  const app = allDatesHarness();
  let tree = app.render(props);
  assert.match(renderToStaticMarkup(tree), /Overdue reason/);
  assert.match(renderToStaticMarkup(tree), /Awaiting seal delivery/);
  descendants(tree, node => node.props.className === 'pulse-details-toggle')[0].props.onClick();
  tree = app.render(props);
  const html = renderToStaticMarkup(tree);
  for (const value of ['Issue / complaint', 'No driver', 'Seal unavailable', 'Recovery truck delayed', 'First trip incomplete', 'Pump replaced', 'Pump tested', 'Pump removed', 'Vendor inspection', 'Workshop team', '09-09-2026']) assert.ok(html.includes(value), value);
  assert.ok(!html.includes('[object Object]'));
});

test('total breakdowns box counts open requests by site, lists breakdowns without alerts, and returns to cases', () => {
  const requests = [
    {ref: 'Q-1', door: 'Q-1', site: 'Sasti OB', status: 'Open', start: '2026-09-08 12:00', expectedCompletionAt: '2026-09-12 12:00', dailyRemarks: 'Pump ordered', complaint: 'Quiet breakdown'},
    {ref: 'A-1', door: 'A-1', site: 'Sasti OB', status: 'Open', start: '2026-09-01 12:00', expectedCompletionAt: '2026-09-03 12:00', complaint: 'Overdue breakdown'},
    {ref: 'M-1', door: 'M-1', site: 'Majri OB', status: 'Open', start: '2026-09-10 08:00', expectedCompletionAt: '2026-09-12 12:00', complaint: 'Fresh breakdown'},
    {ref: 'C-1', door: 'C-1', site: 'Majri OB', status: 'Closed', closedAt: '2026-09-09 12:00', start: '2026-09-01 12:00', complaint: 'Closed'},
    {ref: 'I-1', door: 'I-1', site: 'Majri OB', status: 'Idle', start: '2026-09-01 12:00', complaint: 'Idle'},
  ];
  const props = {requests, cases: data.buildInfoPulseCases(requests, {role: 'Admin', now: NOW})};
  const app = allDatesHarness();
  let tree = app.render(props);
  assert.equal(descendants(tree, node => node.props.className?.startsWith('pulse-stat ')).length, 4, 'the four priority boxes stay as they are');
  assert.equal(text(byLabel(tree, 'Total breakdowns: 3 at All sites')), 'Total breakdowns3All sites · open requests, excluding idle');
  assert.equal(text(byLabel(tree, 'Breakdowns at Sasti OB: 2')), 'Sasti OB2');
  assert.equal(text(byLabel(tree, 'Breakdowns at Majri OB: 1')), 'Majri OB1');
  assert.equal(byLabel(tree, 'Total breakdowns: 3 at All sites').props['aria-pressed'], false);
  assert.equal(text(byLabel(tree, 'All cases: 4 cases')), 'All cases4', 'closed and idle rows still raise alert cases');
  assert.ok(!text(byLabel(tree, 'Matching case records')).includes('Quiet breakdown'), 'a breakdown without alerts is not a case');
  byLabel(tree, 'Breakdowns at Sasti OB: 2').props.onClick();
  tree = app.render(props);
  assert.equal(byLabel(tree, 'Breakdowns at Sasti OB: 2').props['aria-pressed'], true);
  assert.equal(byLabel(tree, 'Filter site: Sasti OB').props['aria-pressed'], true);
  assert.equal(text(byLabel(tree, 'Total breakdowns: 2 at Sasti OB')), 'Total breakdowns2Sasti OB · open requests, excluding idle');
  assert.equal(byLabel(tree, 'All cases: 1 cases').props['aria-pressed'], false);
  assert.equal(byLabel(tree, 'Filter issue: All cases').props['aria-pressed'], false);
  assert.match(text(tree), /Sasti OB \/ All breakdowns2 breakdowns/);
  const list = text(byLabel(tree, 'Matching case records'));
  assert.ok(list.indexOf('Overdue breakdown') < list.indexOf('Quiet breakdown'), 'longest standing first');
  assert.ok(list.includes('No alerts'));
  assert.ok(!list.includes('Fresh breakdown') && !list.includes('Idle'));
  byLabel(tree, 'Filter issue: ETC overdue').props.onClick();
  tree = app.render(props);
  assert.equal(byLabel(tree, 'Breakdowns at Sasti OB: 2').props['aria-pressed'], false);
  assert.match(text(tree), /Sasti OB \/ ETC overdue1 cases/);
  byLabel(tree, 'Total breakdowns: 2 at Sasti OB').props.onClick();
  tree = app.render(props);
  assert.match(text(tree), /2 breakdowns/);
  byLabel(tree, 'Total breakdowns: 2 at Sasti OB').props.onClick();
  tree = app.render(props);
  assert.equal(byLabel(tree, 'All cases: 1 cases').props['aria-pressed'], true);
  assert.match(text(tree), /Sasti OB \/ All cases1 cases/);
  descendants(tree, node => node.type === 'input')[0].props.onChange({target: {value: '2026-09-10'}});
  tree = app.render(props);
  assert.ok(byLabel(tree, 'Total breakdowns: 0 at Sasti OB'), 'date filters apply to the breakdown count');
  assert.equal(text(byLabel(tree, 'Breakdowns at Majri OB: 1')), 'Majri OB1');
});

test('all case cards appear immediately below the four count boxes without a repeated site table', () => {
  const app = allDatesHarness();
  let tree = app.render();
  assert.equal(descendants(tree, node => node.type === 'table').length, 0);
  assert.equal(descendants(tree, node => node.props.className?.startsWith('pulse-stat ')).length, 4);
  for (const label of ['All cases: 67 cases', 'Critical: 67 cases', 'Warnings: 0 cases', 'Updates: 0 cases']) assert.ok(byLabel(tree, label), label);
  assert.equal(byLabel(tree, 'All cases: 67 cases').props['aria-pressed'], true);
  assert.equal(descendants(tree, node => node.props.className === 'pulse-record-link').length, 25);
  assert.match(text(tree), /Issue \/ complaintHydraulic leak/);
  assert.equal(byLabel(tree, 'Filter issue: All cases').props['aria-pressed'], true);
  assert.match(text(tree), /1–25 of 67 cases/);
});

test('cleared date filters show all sites with exact site badges and no remembered site filter', () => {
  const app = allDatesHarness();
  let tree = app.render();
  assert.equal(byLabel(tree, 'Filter site: All sites').props['aria-pressed'], true);
  assert.equal(text(byLabel(tree, 'Filter site: All sites')), 'All sites67');
  assert.equal(text(byLabel(tree, 'Filter site: Sasti OB')), 'Sasti OB60');
  assert.equal(text(byLabel(tree, 'Filter site: Majri OB')), 'Majri OB7');
  assert.ok(descendants(tree, node => node.type === 'input').every(input => input.props.value === ''));
  byLabel(tree, 'Filter site: Sasti OB').props.onClick();
  tree = app.render();
  assert.equal(byLabel(tree, 'Filter site: Sasti OB').props['aria-pressed'], true);
  assert.equal(text(byLabel(tree, 'Filter site: All sites')), 'All sites67');
  assert.equal(text(byLabel(tree, 'Filter issue: All cases')), 'All cases60');
  byLabel(tree, 'Filter site: All sites').props.onClick();
  assert.equal(text(byLabel(app.render(), 'Filter issue: All cases')), 'All cases67');
  byLabel(app.render(), 'Filter site: Majri OB').props.onClick();
  assert.equal(byLabel(allDatesHarness().render(), 'Filter site: All sites').props['aria-pressed'], true);
});

test('site tabs retain the issue drill-down, clear pagination, and All sites restores every matching case', () => {
  const app = allDatesHarness();
  let tree = app.render();
  byLabel(tree, 'Filter site: Sasti OB').props.onClick();
  byLabel(app.render(), 'Filter issue: ETC overdue').props.onClick();
  tree = app.render();
  assert.equal(byLabel(tree, 'Filter site: Sasti OB').props['aria-pressed'], true);
  byLabel(tree, 'Next cases').props.onClick();
  tree = app.render();
  assert.match(text(tree), /26–50 of 60 cases/);
  byLabel(tree, 'Filter site: Majri OB').props.onClick();
  tree = app.render();
  assert.match(text(tree), /Majri OB.*ETC overdue/);
  assert.equal(descendants(tree, node => node.props.className === 'pulse-record-link').length, 7);
  assert.ok(!text(byLabel(tree, 'Matching case records')).includes('R-0'));
  byLabel(tree, 'Filter site: All sites').props.onClick();
  tree = app.render();
  assert.match(text(tree), /All sites.*ETC overdue/);
  assert.match(text(tree), /1–25 of 67 cases/);
});

test('site badges and issue counts follow both filters, including a site with zero matching cases', () => {
  const requests = [
    {ref: 'A', site: 'Sasti OB', status: 'Open', start: '2026-09-01 12:00', expectedCompletionAt: '2026-09-03 12:00'},
    {ref: 'B', site: 'Sasti OB', status: 'Idle', start: '2026-09-02 12:00', idleReason: 'No driver'},
    {ref: 'C', site: 'Majri OB', status: 'Idle', start: '2026-09-02 12:00', idleReason: 'No work'},
    {ref: 'D', site: 'Majri OB', status: 'Open', start: '2026-09-02 12:00', expectedCompletionAt: '2026-09-03 12:00'},
  ];
  const props = {requests, cases: data.buildInfoPulseCases(requests, {now: NOW}), scope: {label: 'All regions', sites: ['Lalpeth OB']}};
  const app = allDatesHarness();
  let tree = app.render(props);
  byLabel(tree, 'Filter issue: Idle').props.onClick();
  tree = app.render(props);
  assert.equal(text(byLabel(tree, 'Filter site: All sites')), 'All sites2');
  assert.equal(text(byLabel(tree, 'Filter site: Sasti OB')), 'Sasti OB1');
  assert.equal(text(byLabel(tree, 'Filter site: Majri OB')), 'Majri OB1');
  byLabel(tree, 'Filter site: Sasti OB').props.onClick();
  tree = app.render(props);
  assert.match(text(tree), /Sasti OB.*Idle/);
  assert.equal(descendants(tree, node => node.props.className === 'pulse-record-link').length, 1);
  descendants(tree, node => node.props.className === 'pulse-reset')[0].props.onClick();
  tree = app.render(props);
  byLabel(tree, 'Filter issue: ETC overdue').props.onClick();
  tree = app.render(props);
  descendants(tree, node => node.type === 'input')[0].props.onChange({target: {value: '2026-09-02'}});
  tree = app.render(props);
  assert.equal(text(byLabel(tree, 'Filter site: All sites')), 'All sites1');
  assert.equal(text(byLabel(tree, 'Filter site: Sasti OB')), 'Sasti OB0');
  assert.equal(text(byLabel(tree, 'Filter site: Majri OB')), 'Majri OB1');
  assert.equal(text(byLabel(tree, 'Filter site: Lalpeth OB')), 'Lalpeth OB0');
  assert.match(text(tree), /All sites.*ETC overdue/);
  byLabel(tree, 'Filter site: Sasti OB').props.onClick();
  tree = app.render(props);
  assert.match(text(tree), /No matching cases/);
  byLabel(tree, 'Filter site: All sites').props.onClick();
  tree = app.render(props);
  assert.equal(descendants(tree, node => node.props.className === 'pulse-record-link').length, 1);
  assert.ok(text(byLabel(tree, 'Matching case records')).includes('D'));
});

test('clearing an issue keeps the selected site and still shows its records', () => {
  const app = allDatesHarness();
  byLabel(app.render(), 'Filter site: Majri OB').props.onClick();
  let tree = app.render();
  assert.match(text(tree), /Majri OB.*All cases/);
  assert.equal(descendants(tree, node => node.props.className === 'pulse-record-link').length, 7);
  byLabel(tree, 'Filter issue: ETC overdue').props.onClick();
  tree = app.render();
  assert.match(text(tree), /Majri OB.*ETC overdue/);
  assert.equal(descendants(tree, node => node.props.className === 'pulse-record-link').length, 7);
  byLabel(tree, 'Filter issue: All cases').props.onClick();
  assert.equal(byLabel(app.render(), 'Filter site: Majri OB').props['aria-pressed'], true);
});

test('short stoppages show minutes, exact dates, complaint and missing overdue reason before expansion', () => {
  const request = {ref: 'SHORT', door: 'V592-96804', site: 'Dhoptala OB (2nd)', status: 'Open', start: '2026-09-10 11:43:26', expectedCompletionAt: '2026-09-10 11:50:00', complaint: 'Air pressure leak'};
  const app = allDatesHarness();
  const props = {requests: [request], cases: data.buildInfoPulseCases([request], {now: NOW})};
  const html = renderToStaticMarkup(app.render(props));
  for (const value of ['Standing since', 'Down for', '16m', 'ETC overdue by', '10m', '11:43:26 AM', 'Air pressure leak', 'Overdue reason', 'Not recorded']) assert.ok(html.includes(value), value);
  assert.ok(!html.includes('0.0'));
  assert.ok(!html.includes('pulse-record-detail'));
});

test('restored count boxes reconcile unique cases, combine with site and issue filters, and reset', () => {
  const requests = [
    {ref: 'A', site: 'Sasti OB', status: 'Open', start: '2026-09-01 12:00', expectedCompletionAt: '2026-09-03 12:00'},
    {ref: 'B', site: 'Sasti OB', status: 'Idle', start: '2026-09-02 12:00', idleReason: 'No driver'},
    {ref: 'C', site: 'Majri OB', status: 'Idle', start: '2026-09-02 12:00', idleReason: 'No work'},
    {ref: 'D', site: 'Majri OB', status: 'Open', start: '2026-09-10 11:00', complaint: 'Air leak'},
  ];
  const props = {requests, cases: data.buildInfoPulseCases(requests, {now: NOW})};
  const app = allDatesHarness();
  let tree = app.render(props);
  for (const label of ['All cases: 4 cases', 'Critical: 1 cases', 'Warnings: 2 cases', 'Updates: 1 cases']) assert.ok(byLabel(tree, label), label);
  byLabel(tree, 'Warnings: 2 cases').props.onClick();
  tree = app.render(props);
  assert.equal(byLabel(tree, 'Warnings: 2 cases').props['aria-pressed'], true);
  assert.equal(descendants(tree, node => node.type === 'article').length, 2);
  assert.equal(text(byLabel(tree, 'Filter issue: Idle')), 'Idle2');
  byLabel(tree, 'Filter site: Sasti OB').props.onClick();
  tree = app.render(props);
  assert.ok(byLabel(tree, 'All cases: 2 cases'));
  assert.ok(byLabel(tree, 'Critical: 1 cases'));
  assert.ok(byLabel(tree, 'Warnings: 1 cases'));
  assert.equal(descendants(tree, node => node.type === 'article').length, 1);
  byLabel(tree, 'Filter issue: Idle').props.onClick();
  tree = app.render(props);
  assert.ok(byLabel(tree, 'All cases: 1 cases'));
  assert.equal(text(byLabel(tree, 'Filter site: All sites')), 'All sites2');
  byLabel(tree, 'All cases: 1 cases').props.onClick();
  tree = app.render(props);
  assert.equal(descendants(tree, node => node.type === 'article').length, 1);
  assert.equal(byLabel(tree, 'Filter issue: Idle').props['aria-pressed'], true);
  descendants(tree, node => node.props.className === 'pulse-reset')[0].props.onClick();
  tree = app.render(props);
  assert.equal(byLabel(tree, 'All cases: 4 cases').props['aria-pressed'], true);
  assert.equal(byLabel(tree, 'Filter site: All sites').props['aria-pressed'], true);
  assert.equal(descendants(tree, node => node.type === 'article').length, 4);
});
