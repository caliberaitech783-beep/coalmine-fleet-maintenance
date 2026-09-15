import test from 'node:test';
import assert from 'node:assert/strict';
import {jobReferenceColumnsLast, requestColumnsInWorkflowOrder} from '../src/table-actions-model.mjs';

test('machine and meter columns stay beside status and breakdown reason with original data indices', () => {
  const labels = ['Status', 'Days of breakdown', 'Current location', 'Started', 'Machine / Door no.', 'Equipment category', 'Type of breakdown', 'Reason of breakdown', 'Equipment group', 'Model', 'Opening HMR', 'Opening KMR'];
  const columns = labels.map((label, index) => ({label, index, key: String(index)}));
  const ordered = jobReferenceColumnsLast(columns);
  assert.deepEqual(ordered.map(c => c.label), ['Status', 'Machine / Door no.', 'Days of breakdown', 'Type of breakdown', 'Reason of breakdown', 'Opening HMR', 'Opening KMR', 'Current location', 'Started', 'Equipment category', 'Equipment group', 'Model']);
  assert.deepEqual(ordered.map(c => c.index), [0, 4, 1, 6, 7, 10, 11, 2, 3, 5, 8, 9]);
  const workflow = requestColumnsInWorkflowOrder([{label: 'Started'}, {label: 'Status'}, {label: 'Site location'}, {label: 'Door no.'}, {label: 'Actions'}], true);
  assert.equal(workflow[workflow.findIndex(c => c.label === 'Status') + 1].label, 'Door no.');
  assert.equal(workflow[0].label, 'Actions');
});

test('unrelated tables retain their existing order', () => {
  const columns = ['Name', 'Model', 'HMR', 'KMR'].map(label => ({label}));
  assert.deepEqual(jobReferenceColumnsLast(columns), columns);
});

test('all breakdown heading variants place type then reason directly after days', () => {
  for (const [type, reason] of [['Type of breakdown', 'Reason of breakdown'], ['Breakdown type', 'Breakdown reason'], ['Repair category', 'Reason']]) {
    const columns = ['Status', reason, 'Site location', 'Days of breakdown', 'Model', type].map(label => ({label}));
    for (const ordered of [jobReferenceColumnsLast(columns), requestColumnsInWorkflowOrder(columns)]) {
      const index = ordered.findIndex(column => column.label === 'Days of breakdown');
      assert.deepEqual(ordered.slice(index, index + 3).map(column => column.label), ['Days of breakdown', type, reason]);
    }
  }
});
