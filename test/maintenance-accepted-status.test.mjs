import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { matchesSmartSearch } from '../smart-search.mjs';
import * as acceptance from '../request-acceptance.mjs';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const component = source.slice(source.indexOf('function Status('), source.indexOf('function ThemeToggle('))
  + source.slice(source.indexOf('const sortCollator ='), source.indexOf('function SortableHeader('))
  + source.slice(source.indexOf('const EMPTY_TABLE_FILTER_VALUE ='), source.indexOf('function TableParameterFilter('))
  + source.slice(source.indexOf('function MobileWorkflowTable('), source.indexOf('function RequestEditForm('));
const { code } = await transformWithOxc(component, 'maintenance-status.jsx', { jsx: { runtime: 'classic' } });
const Null = () => null;
const ExportMenu = () => null, PrintButton = () => null, TableParameterFilter = () => null;
const FilterableHeader = ({ label }) => React.createElement('th', {}, label);
function all(tree, predicate) {
  const result = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!React.isValidElement(node)) return;
    if (predicate(node)) result.push(node);
    visit(node.props.children);
  }
  visit(tree);
  return result;
}
const find = (tree, type) => all(tree, node => node.type === type)[0];
const content = node => Array.isArray(node) ? node.map(content).join('') : React.isValidElement(node) ? content(node.props.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
const rowKeys = tree => all(tree, node => node.type === 'tr' && node.key).map(node => node.key);
function harness() {
  const slots = [];
  let cursor = 0;
  const useState = initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  };
  const scope = {
    React: { ...React, useId: () => 'workflow-controls' }, useState, useEffect: () => {}, useMemo: fn => fn(),
    ...acceptance, matchesSmartSearch, FilterableHeader, ExportMenu, PrintButton, TableParameterFilter,
    ActionsTable: ({ children }) => React.createElement('table', {}, children), MaintenanceRemarks: Null, Modal: Null,
    RequestTimelineButton: ({ reference }) => React.createElement('b', {}, reference), authToken: 'fixture',
    formatTwelveHourDateTime: value => value || '—', normalizeEquipmentGroup: value => value,
    calculateBreakdownDaysFromStart: () => 1, MeterFileCell: Null, TripCardCell: Null,
  };
  for (const icon of ['Menu', 'Search', 'ListFilter', 'MapPin', 'Flag', 'Pencil', 'Trash2', 'CheckCircle2', 'MessageCircle', 'ShieldCheck']) scope[icon] = Null;
  const Table = new Function(...Object.keys(scope), `${code}; return MobileWorkflowTable;`)(...Object.values(scope));
  return { render(props) { cursor = 0; return Table(props); } };
}
const rows = Object.freeze([
  Object.freeze({ ref: 'REQ-NEW', status: 'Open', acceptanceRequired: true }),
  Object.freeze({ ref: 'REQ-RECEIVED', status: 'Open', acceptanceRequired: true, acceptedAt: '2026-09-09 10:30:00' }),
  Object.freeze({ ref: 'REQ-WORKING', status: 'In progress', acceptedAt: '2026-09-09 10:31:00' }),
  Object.freeze({ ref: 'REQ-IDLE', status: 'Idle', idleReason: 'No work', acceptedAt: '2026-09-09 10:00:00' }),
  Object.freeze({ ref: 'REQ-CLOSED', status: 'Closed', acceptedAt: '2026-09-09 10:00:00' }),
  Object.freeze({ ref: 'REQ-LEGACY', status: 'In progress', acceptedAt: ' ' }),
]);
const props = { rows, showAcceptanceStatus: true };

test('close list shows accepted active vehicles In progress and filters by that label', () => {
  const app = harness();
  const closeProps = {rows, showInProgressStatus: true};
  let tree = app.render(closeProps);
  const status = find(tree, ExportMenu).props.columns.find(column => column.key === 'status');
  assert.deepEqual(rows.map(status.value), ['Open', 'In progress', 'In progress', 'Idle', 'Closed', 'In progress']);
  assert.equal((renderToStaticMarkup(tree).match(/class="status in-progress"/g) || []).length, 3);
  find(tree, 'select').props.onChange({target: {value: 'In progress'}});
  tree = app.render(closeProps);
  assert.deepEqual(rowKeys(tree), ['REQ-RECEIVED', 'REQ-WORKING', 'REQ-LEGACY']);
  assert.equal(rows[1].status, 'Open');
});

test('only accepted active requests receive the Accepted badge without changing saved statuses', () => {
  const tree = harness().render(props);
  const labels = find(tree, ExportMenu).props.columns.find(column => column.key === 'status');
  assert.deepEqual(rows.map(labels.value), ['Open', 'Accepted', 'Accepted', 'Idle', 'Closed', 'In progress']);
  const html = renderToStaticMarkup(tree);
  assert.equal((html.match(/class="status accepted"/g) || []).length, 2);
  assert.equal((html.match(/class="status open"/g) || []).length, 1);
  assert.equal(rows[1].status, 'Open');
  assert.equal(rows[2].status, 'In progress');
});

test('search, status filter, column filter, sorting, print and export agree with the displayed status', () => {
  const app = harness();
  let tree = app.render(props);
  assert.ok(all(tree, node => node.type === 'option').some(node => node.props.value === 'Accepted'));
  find(tree, 'input').props.onChange({ target: { value: 'accepted' } });
  tree = app.render(props);
  assert.deepEqual(rowKeys(tree), ['REQ-RECEIVED', 'REQ-WORKING']);
  find(tree, 'input').props.onChange({ target: { value: '' } });
  find(tree, 'select').props.onChange({ target: { value: 'Open' } });
  tree = app.render(props);
  assert.deepEqual(rowKeys(tree), ['REQ-NEW']);
  find(tree, 'select').props.onChange({ target: { value: 'Accepted' } });
  tree = app.render(props);
  assert.deepEqual(rowKeys(tree), ['REQ-RECEIVED', 'REQ-WORKING']);
  for (const type of [PrintButton, ExportMenu]) {
    const output = find(tree, type).props;
    assert.deepEqual(output.rows, [rows[1], rows[2]]);
    assert.deepEqual(output.rows.map(output.columns.find(column => column.key === 'status').value), ['Accepted', 'Accepted']);
  }
  find(tree, 'select').props.onChange({ target: { value: '' } });
  tree = app.render(props);
  const statusHeader = all(tree, node => node.type === FilterableHeader && node.props.sortKey === 'status')[0];
  assert.ok(statusHeader.props.values.includes('Accepted'));
  statusHeader.props.onFilterChange('Accepted');
  tree = app.render(props);
  assert.deepEqual(rowKeys(tree), ['REQ-RECEIVED', 'REQ-WORKING']);
  find(tree, TableParameterFilter).props.onClearFilters();
  tree = app.render(props);
  all(tree, node => node.type === FilterableHeader && node.props.sortKey === 'status')[0].props.onSort('status', 'asc');
  tree = app.render(props);
  assert.deepEqual(rowKeys(tree), ['REQ-RECEIVED', 'REQ-WORKING', 'REQ-CLOSED', 'REQ-IDLE', 'REQ-LEGACY', 'REQ-NEW']);
});

test('edit and daily-update actions still receive the original request with its stored status', () => {
  const received = [];
  const tree = harness().render({ ...props, rows: [rows[1]], showActions: true, onEdit: row => received.push(row), onRemark: row => received.push(row) });
  for (const label of ['Edit', 'Daily update']) {
    all(tree, node => node.type === 'button' && content(node).trim() === label)[0].props.onClick();
  }
  assert.deepEqual(received, [rows[1], rows[1]]);
  assert.equal(received[0].status, 'Open');
});

test('other workflow tables continue showing their existing status values', () => {
  const tree = harness().render({ rows });
  const statusColumn = find(tree, ExportMenu).props.columns.find(column => column.key === 'status');
  assert.deepEqual(rows.map(statusColumn.value), rows.map(row => row.status));
  assert.equal(renderToStaticMarkup(tree).includes('status accepted'), false);
});
