import test from 'node:test';
import assert from 'node:assert/strict';
import {jobReferenceColumnsLast, requestColumnsInWorkflowOrder} from '../src/table-actions-model.mjs';

test('machine and meter columns stay beside status and breakdown reason with original data indices', () => {
  const labels = ['Status', 'Days of breakdown', 'Current location', 'Started', 'Machine / Door no.', 'Equipment category', 'Type of breakdown', 'Reason of breakdown', 'Equipment group', 'Model', 'Opening HMR', 'Opening KMR'];
  const columns = labels.map((label, index) => ({label, index, key: String(index)}));
  const ordered = jobReferenceColumnsLast(columns);
  assert.deepEqual(ordered.map(c => c.label), ['Status', 'Current location', 'Machine / Door no.', 'Days of breakdown', 'Type of breakdown', 'Reason of breakdown', 'Opening HMR', 'Opening KMR', 'Started', 'Equipment category', 'Equipment group', 'Model']);
  assert.deepEqual(ordered.map(c => c.index), [0, 2, 4, 1, 6, 7, 10, 11, 3, 5, 8, 9]);
  const workflow = requestColumnsInWorkflowOrder([{label: 'Started'}, {label: 'Status'}, {label: 'Site location'}, {label: 'Door no.'}, {label: 'Actions'}], true);
  assert.deepEqual(workflow.map(c => c.label), ['Door no.', 'Status', 'Actions', 'Started', 'Site location']);
});

test('unrelated tables retain their existing order', () => {
  const columns = ['Name', 'Model', 'HMR', 'KMR'].map(label => ({label}));
  assert.deepEqual(jobReferenceColumnsLast(columns), columns);
});

test('request lifecycle lists place Request site immediately after Status', () => {
  for (const event of ['Production Request', 'Closed', 'Verified', 'Idle Vehicles', 'Open in Maint', 'Open in MIS']) {
    const labels = ['Status', 'Days of breakdown', 'Started', 'Machine / Door no.', 'Request site', 'Closed'];
    const columns = labels.map((label, index) => ({label, index}));
    const ordered = jobReferenceColumnsLast(columns);
    assert.deepEqual(ordered.map(column => column.label), ['Status', 'Request site', 'Machine / Door no.', 'Days of breakdown', 'Started', 'Closed'], event);
    assert.deepEqual(ordered.map(column => column.index), [0, 4, 3, 1, 2, 5], event);
  }
});

test('all breakdown heading variants place type then reason directly after days', () => {
  for (const [type, reason] of [['Type of breakdown', 'Reason of breakdown'], ['Breakdown type', 'Breakdown reason'], ['Repair category', 'Reason']]) {
    const columns = ['Status', reason, 'Site location', 'Days of breakdown', 'Model', type].map(label => ({label}));
    const ordered = jobReferenceColumnsLast(columns);
    const index = ordered.findIndex(column => column.label === 'Days of breakdown');
    assert.deepEqual(ordered.slice(index, index + 3).map(column => column.label), ['Days of breakdown', type, reason]);
    assert.ok(requestColumnsInWorkflowOrder(columns).some(column => column.label === type));
    assert.ok(requestColumnsInWorkflowOrder(columns).some(column => column.label === reason));
  }
});
