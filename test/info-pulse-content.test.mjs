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
    React, ...data, ...dates, ...reasons, requestStatusLabel, parseIstTimestamp,
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
  const count = byLabel(tree, 'Sasti OB: 60 ETC overdue');
  assert.ok(count);
  count.props.onClick();
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
  byLabel(tree, 'Total: 7 cases').props.onClick();
  tree = app.render();
  assert.equal(descendants(tree, node => node.props.className === 'pulse-record-link').length, 7);
  descendants(tree, node => node.props.className === 'pulse-reset')[0].props.onClick();
  tree = app.render();
  assert.ok(byLabel(tree, 'Total: 67 cases'));
  descendants(tree, node => node.type === 'select')[0].props.onChange({target: {value: 'sasti ob'}});
  tree = app.render();
  assert.ok(byLabel(tree, 'Total: 60 cases'));
  assert.equal(byLabel(tree, 'Majri OB: 7 cases'), undefined);
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
  assert.ok(byLabel(tree, 'Total: 67 cases'));
});

test('real daily-update arrays render all reasons and dated history without crashing', () => {
  const request = {ref: 'R-REASONS', door: 'E02-123', site: 'Sasti OB', status: 'Open', start: '2026-09-01 12:00', expectedCompletionAt: '2026-09-05 12:00', complaint: 'Hydraulic leak', idleReason: 'No driver', delayedReason: 'Seal unavailable', arrivalFlagRemark: 'Recovery truck delayed', misFlagRemark: 'First trip incomplete', maintenanceWork: 'Pump replaced', dailyRemarks: [
    {createdAt: '2026-09-09 12:30', authorName: 'Workshop team', remark: 'Pump tested', delayReason: 'Awaiting seal delivery'},
    {createdAt: '2026-09-08 10:00', authorName: 'Site team', remark: 'Pump removed', delayReason: 'Vendor inspection'},
  ]};
  const props = {requests: [request], cases: data.buildInfoPulseCases([request], {now: NOW})};
  const app = harness();
  let tree = app.render(props);
  byLabel(tree, 'Total: 1 cases').props.onClick();
  tree = app.render(props);
  assert.match(renderToStaticMarkup(tree), /Overdue reason/);
  assert.match(renderToStaticMarkup(tree), /Awaiting seal delivery/);
  descendants(tree, node => node.props.className === 'pulse-details-toggle')[0].props.onClick();
  tree = app.render(props);
  const html = renderToStaticMarkup(tree);
  for (const value of ['All reasons', 'No driver', 'Seal unavailable', 'Recovery truck delayed', 'First trip incomplete', 'Pump replaced', 'Pump tested', 'Pump removed', 'Vendor inspection', 'Workshop team', '09-09-2026']) assert.ok(html.includes(value), value);
  assert.ok(!html.includes('[object Object]'));
});

test('priority cards count unique cases and open matching records', () => {
  const app = harness();
  let tree = app.render();
  byLabel(tree, 'Critical: 67 cases').props.onClick();
  tree = app.render();
  assert.match(text(tree), /All sites.*Critical/);
  assert.match(text(tree), /1–25 of 67 cases/);
});
