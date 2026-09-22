import test from 'node:test';
import assert from 'node:assert/strict';
import {requestColumnsInWorkflowOrder} from '../src/table-actions-model.mjs';

test('maintenance workflow tables lead with door, status, actions and the request timing, then the rest', () => {
  const columns = ['Reason', 'Actions', 'Started', 'Status', 'Delayed reason', 'Door no.', 'Job reference', 'Site location', 'Daily remarks', 'Make', 'Model', 'Equipment group', 'Breakdown type', 'Days of breakdown', 'Idle reason'].map((label, index) => ({label, index}));
  const ordered = requestColumnsInWorkflowOrder(columns, true);
  assert.deepEqual(ordered.map(column => column.label), [
    'Job reference', 'Door no.', 'Status', 'Actions', 'Started', 'Days of breakdown', 'Reason', 'Breakdown type', 'Equipment group', 'Make', 'Model', 'Daily remarks', 'Delayed reason',
    'Site location', 'Idle reason',
  ]);
  assert.deepEqual(ordered.map(column => column.index).sort((a, b) => a - b), columns.map(column => column.index), 'every source column is kept once');
  assert.equal(ordered.find(column => column.label === 'Delayed reason'), columns[4]);
});

test('MIS tables use the same leading layout with their Production date and time column', () => {
  const columns = ['Actions', 'Job reference', 'Door no.', 'Status', 'Production date and time', 'Days of breakdown', 'Closed time'].map((label, index) => ({label, index}));
  assert.deepEqual(requestColumnsInWorkflowOrder(columns, true).map(column => column.label), ['Job reference', 'Door no.', 'Status', 'Actions', 'Production date and time', 'Days of breakdown', 'Closed time']);
});
