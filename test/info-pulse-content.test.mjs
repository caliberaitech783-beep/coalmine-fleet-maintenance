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
    useState(initial) {const slot = cursor++; if (!(slot in slots)) slots[slot] = initial; return [slots[slot], next => {slots[slot] = typeof next === 'function' ? next(slots[slot]) : next;}];},
    useMemo: callback => callback(),
    ...Object.fromEntries(['ArrowLeft', 'ChevronDown', 'ChevronLeft', 'ChevronRight', 'RefreshCw', 'MapPin', 'Truck'].map(name => [name, () => null])),
  };
  const Component = new Function(...Object.keys(bindings), `${code}; return InfoPulseContent;`)(...Object.values(bindings));
  const requests = Array.from({length: 67}, (_, i) => ({ref: `R-${i}`, door: `D-${i}`, site: i < 60 ? 'Sasti OB' : 'Majri OB', status: 'Open', start: i < 60 ? '2026-09-01 12:00' : '2026-09-02 12:00', expectedCompletionAt: '2026-09-03 12:00', complaint: 'Hydraulic leak'}));
  const props = {requests, cases: data.buildInfoPulseCases(requests, {now: NOW}), role: 'Admin', now: NOW, ready: true, scope: {label: 'All regions'}, updatedAt: NOW};
  return {render(overrides = {}) {cursor = 0; return Component({...props, ...overrides});}};
}

test('site number opens its exact cases, pages retain all records, and a case reveals details', () => {
  const app = harness();
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
  const app = harness();
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
  const app = harness();
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
  const app = harness();
  let tree = app.render(props);
  assert.match(renderToStaticMarkup(tree), /Overdue reason/);
  assert.match(renderToStaticMarkup(tree), /Awaiting seal delivery/);
  descendants(tree, node => node.props.className === 'pulse-details-toggle')[0].props.onClick();
  tree = app.render(props);
  const html = renderToStaticMarkup(tree);
  for (const value of ['Issue / complaint', 'No driver', 'Seal unavailable', 'Recovery truck delayed', 'First trip incomplete', 'Pump replaced', 'Pump tested', 'Pump removed', 'Vendor inspection', 'Workshop team', '09-09-2026']) assert.ok(html.includes(value), value);
  assert.ok(!html.includes('[object Object]'));
});

test('all case cards appear immediately below the four count boxes without a repeated site table', () => {
  const app = harness();
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

test('opens on all sites and all dates with exact site badges and no remembered filter', () => {
  const app = harness();
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
  assert.equal(byLabel(harness().render(), 'Filter site: All sites').props['aria-pressed'], true);
});

test('site tabs retain the issue drill-down, clear pagination, and All sites restores every matching case', () => {
  const app = harness();
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
  const app = harness();
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
  const app = harness();
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
  const app = harness();
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
  const app = harness();
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
